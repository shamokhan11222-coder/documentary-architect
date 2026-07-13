// Sequential image generation queue on the single zero-budget pipeline.
//
// Runs images ONE BY ONE with a configurable delay between requests. Every scene
// flows through generateSceneImageResult (Puter primary → Pollinations fallback).
// There is no Gemini key rotation. Completed scenes are saved after every image
// (only when a valid image is produced) and are never regenerated. A failed
// scene is marked failed and the queue continues to the next scene.
import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./local";
import { generateSceneImageResult } from "./generate-image";
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

// 12s between successful Puter requests, 20s when the Pollinations fallback is
// in play. Longer options remain for slow / heavily rate-limited runs.
export const DELAY_OPTIONS = [12000, 20000, 30000, 60000] as const;
const DELAY_KEY = "docos.imageQueue.delay";

export function getQueueDelay(): number {
  const v = readLocal<number>(DELAY_KEY, 12000);
  return (DELAY_OPTIONS as readonly number[]).includes(v) ? v : 12000;
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
let stopAfterCurrent = false;

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

/** Finish the image currently generating, then stop the queue (do not cancel
 *  the in-flight request). */
export function stopAfterCurrentImage() {
  if (state !== "running" && state !== "cooling") return;
  stopAfterCurrent = true;
  message = "Stopping after the current image…";
  emit();
}

export function resumeImageQueue() {
  if (state !== "paused" && state !== "cooling") return;
  stopAfterCurrent = false;
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
    // One request per scene. The pipeline never throws — it returns a
    // normalized result. A failure marks the scene failed and we move on.
    const result = await generateSceneImageResult(scene);
    if (token !== loopToken) return; // paused mid-request
    if (result.success && result.imageDataUrl) {
      activeKeyName = result.provider === "puter" ? "Puter AI" : "Pollinations";
      activeModel = result.provider === "puter" ? "puter-txt2img" : "flux";
      await runner.save(scene, result.imageDataUrl); // save only valid images
      setItem(n, "done");
    } else {
      setItem(n, "failed");
      message = `Scene ${n}: ${result.errorMessage ?? "Image generation failed."}`;
    }
    emit();
    // Honor "Stop After Current Image".
    if (stopAfterCurrent) {
      stopAfterCurrent = false;
      state = "paused";
      currentScene = null;
      message = "Stopped after the current image.";
      emit();
      return;
    }
    // Delay between image requests.
    if (token === loopToken && state === "running" && firstPending() != null) {
      await sleep(getQueueDelay(), token);
    }
  }
}
