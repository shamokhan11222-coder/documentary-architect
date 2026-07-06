// Sequential image generation queue with Gemini multi-key rotation.
//
// Runs images ONE BY ONE with a configurable delay between requests. Before each
// image the rotation runner picks the first available Gemini key; if all keys are
// cooling down the queue pauses and auto-resumes when a key becomes available.
// Completed scenes are saved after every image and never regenerated.
import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./local";
import {
  generateSceneImageRotating,
  ALL_KEYS_COOLING_CODE,
  imageErrorMessage,
  ImageGenError,
} from "./generate-image";
import {
  allCoolingOrDisabled,
  nextRetryTime,
  isLimitError,
  isDailyLimit,
} from "./gemini-image-keys";
import type { VisualScene } from "./types";

export type QueueState = "idle" | "running" | "paused" | "cooling" | "done";
export type ItemState = "pending" | "running" | "done" | "failed" | "cooling";

export interface QueueItemView {
  sceneNumber: number;
  status: ItemState;
}

export interface ImageQueueSnapshot {
  state: QueueState;
  items: QueueItemView[];
  currentScene: number | null;
  activeKeyName: string | null;
  activeModel: string | null;
  completed: number;
  pending: number;
  failed: number;
  total: number;
  message: string | null;
  nextRetryAt: number | null;
  delayMs: number;
}

export const DELAY_OPTIONS = [15000, 30000, 60000, 120000] as const;
const DELAY_KEY = "docos.imageQueue.delay";

export function getQueueDelay(): number {
  const v = readLocal<number>(DELAY_KEY, 30000);
  return (DELAY_OPTIONS as readonly number[]).includes(v) ? v : 30000;
}
export function setQueueDelay(ms: number) {
  writeLocal(DELAY_KEY, ms);
  emit();
}

// ---- internal state ----
interface Runner {
  save: (scene: VisualScene, image: string) => Promise<void>;
  done: (n: number) => boolean;
}

let state: QueueState = "idle";
let items: Map<number, ItemState> = new Map();
let sceneMap: Map<number, VisualScene> = new Map();
let currentScene: number | null = null;
let activeKeyName: string | null = null;
let activeModel: string | null = null;
let message: string | null = null;
let nextRetryAt: number | null = null;
let runner: Runner | null = null;
let loopToken = 0;
let waitTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
let snapshot = build();

function build(): ImageQueueSnapshot {
  const list: QueueItemView[] = [...items.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sceneNumber, status]) => ({ sceneNumber, status }));
  const completed = list.filter((i) => i.status === "done").length;
  const failed = list.filter((i) => i.status === "failed").length;
  const pending = list.filter((i) => i.status === "pending" || i.status === "cooling").length;
  return {
    state,
    items: list,
    currentScene,
    activeKeyName,
    activeModel,
    completed,
    pending,
    failed,
    total: list.length,
    message,
    nextRetryAt,
    delayMs: getQueueDelay(),
  };
}

function emit() {
  snapshot = build();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useImageQueue(): ImageQueueSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

function setItem(n: number, s: ItemState) {
  items.set(n, s);
}

const sleep = (ms: number, token: number) =>
  new Promise<void>((resolve) => {
    if (waitTimer) clearTimeout(waitTimer);
    waitTimer = setTimeout(() => {
      waitTimer = null;
      if (token === loopToken) resolve();
    }, ms);
  });

/** Register the concrete save + completed-check callbacks from the visual page. */
export function configureImageQueue(r: Runner) {
  runner = r;
}

/** Enqueue a set of scenes (skipping ones already completed) and start running. */
export function startImageQueue(scenes: VisualScene[]) {
  if (!runner) return;
  sceneMap = new Map(scenes.map((s) => [s.sceneNumber, s]));
  const next = new Map<number, ItemState>();
  for (const s of scenes) {
    // Never regenerate completed images.
    if (runner.done(s.sceneNumber)) next.set(s.sceneNumber, "done");
    else next.set(s.sceneNumber, "pending");
  }
  items = next;
  message = null;
  nextRetryAt = null;
  state = "running";
  loopToken++;
  emit();
  void loop(loopToken);
}

export function pauseImageQueue() {
  if (state !== "running" && state !== "cooling") return;
  loopToken++; // cancel current wait/loop
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  state = "paused";
  currentScene = null;
  message = "Queue paused.";
  emit();
}

export function resumeImageQueue() {
  if (state !== "paused" && state !== "cooling") return;
  state = "running";
  message = null;
  nextRetryAt = null;
  loopToken++;
  emit();
  void loop(loopToken);
}

/** Re-queue every failed scene and run. */
export function retryFailedImages() {
  if (!runner) return;
  for (const [n, s] of items) if (s === "failed") setItem(n, "pending");
  resumeOrStart();
}

/** Continue from the first not-yet-completed scene (last successful + 1). */
export function continueFromLastImage() {
  if (!runner) return;
  const sorted = [...items.entries()].sort((a, b) => a[0] - b[0]);
  const lastDone = sorted.filter(([, s]) => s === "done").map(([n]) => n).pop() ?? 0;
  for (const [n, s] of sorted) {
    if (n > lastDone && s !== "done") setItem(n, "pending");
  }
  resumeOrStart();
}

function resumeOrStart() {
  state = "running";
  message = null;
  nextRetryAt = null;
  loopToken++;
  emit();
  void loop(loopToken);
}

function firstPending(): number | null {
  const sorted = [...items.entries()].sort((a, b) => a[0] - b[0]);
  for (const [n, s] of sorted) if (s === "pending" || s === "cooling") return n;
  return null;
}

async function loop(token: number) {
  if (!runner) return;
  while (token === loopToken && state === "running") {
    const n = firstPending();
    if (n == null) {
      state = "done";
      currentScene = null;
      activeKeyName = null;
      message = "All images generated.";
      emit();
      return;
    }
    // All keys cooling down → pause and schedule auto-resume.
    if (allCoolingOrDisabled()) {
      enterCooling(token);
      return;
    }
    const scene = sceneMap.get(n);
    if (!scene) {
      setItem(n, "failed");
      emit();
      continue;
    }
    currentScene = n;
    setItem(n, "running");
    emit();
    try {
      const { image, keyName } = await generateSceneImageRotating(scene);
      if (token !== loopToken) return; // paused mid-request
      activeKeyName = keyName;
      await runner.save(scene, image); // save progress after every image
      setItem(n, "done");
      emit();
    } catch (e) {
      if (token !== loopToken) return;
      if (e instanceof ImageGenError && e.code === ALL_KEYS_COOLING_CODE) {
        setItem(n, "cooling");
        enterCooling(token);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (isLimitError(msg, e instanceof ImageGenError ? e.code : null, e instanceof ImageGenError ? e.status : null)) {
        // Every key got cooled inside rotation but still limited — mark cooling.
        setItem(n, "cooling");
        if (allCoolingOrDisabled()) {
          enterCooling(token);
          return;
        }
      } else {
        setItem(n, "failed");
        message = `Scene ${n}: ${imageErrorMessage(e)}`;
      }
      emit();
    }
    // Delay between image requests.
    if (token === loopToken && state === "running" && firstPending() != null) {
      await sleep(getQueueDelay(), token);
    }
  }
}

function enterCooling(token: number) {
  state = "cooling";
  currentScene = null;
  const retry = nextRetryTime();
  nextRetryAt = retry;
  message = "All Gemini image keys are cooling down. Resume automatically when one becomes available.";
  emit();
  const wait = retry ? Math.max(1000, retry - Date.now() + 500) : 60000;
  if (waitTimer) clearTimeout(waitTimer);
  waitTimer = setTimeout(() => {
    waitTimer = null;
    if (token !== loopToken) return;
    if (allCoolingOrDisabled()) {
      // still cooling — check again later
      enterCooling(token);
      return;
    }
    state = "running";
    message = null;
    nextRetryAt = null;
    emit();
    void loop(token);
  }, wait);
}

export { isDailyLimit };
