// Sequential image generation queue on the single zero-budget pipeline.
//
// Runs images ONE BY ONE with a configurable delay between requests. Every scene
// flows through generateSceneImage (Puter primary → Pollinations fallback).
// There is no Gemini key rotation. Completed scenes are saved after every image
// (only when a valid image is produced) and are never regenerated. A failed
// scene is marked failed and the queue continues to the next scene.
import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./local";
import { generateSceneImage, imageErrorMessage } from "./generate-image";
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

/** Neutral placeholder PNG (1024x576) used when a scene image is skipped
 *  or when a Draft Export needs a stand-in for a missing/failed image. */
export function makePlaceholderImage(sceneNumber: number, label = "Placeholder"): string {
  if (typeof document === "undefined") {
    // SSR-safe fallback: 1x1 transparent PNG.
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  }
  const w = 1024, h = 576;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1f2937");
  g.addColorStop(1, "#0b0f16");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = "#e5e7eb";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`Scene ${sceneNumber}`, w / 2, h / 2 - 30);
  ctx.font = "400 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(label, w / 2, h / 2 + 20);
  return c.toDataURL("image/png");
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

/** Retry the current stuck scene (or the first non-done scene) — re-queues it
 *  as pending and (re)starts the loop. Never touches completed images. */
export function retryStuckScene() {
  if (!runner) return;
  const target = currentScene ?? firstPending();
  if (target == null) return;
  if (items.get(target) !== "done") setItem(target, "pending");
  resumeOrStart();
}

/** Save a neutral placeholder for a specific scene and mark it done so the
 *  export pipeline can continue. Never overwrites an existing completed image. */
export async function skipSceneWithPlaceholder(sceneNumber: number): Promise<void> {
  if (!runner) return;
  if (items.get(sceneNumber) === "done") return;
  const scene = sceneMap.get(sceneNumber);
  if (!scene) return;
  const img = makePlaceholderImage(sceneNumber, "Missing image — placeholder");
  await runner.save(scene, img);
  setItem(sceneNumber, "done");
  if (currentScene === sceneNumber) currentScene = null;
  emit();
}

/** Skip the scene currently generating (or the first not-done scene) and move
 *  on. If the loop is idle this simply marks it done with a placeholder. */
export async function skipCurrentWithPlaceholder(): Promise<void> {
  const target = currentScene ?? firstPending();
  if (target == null) return;
  await skipSceneWithPlaceholder(target);
  // Cancel any in-flight wait and let the loop pick up the next pending scene.
  if (state === "running" || state === "cooling") {
    loopToken++;
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    resumeOrStart();
  }
}

/** Mark every remaining pending / failed / cooling scene as a placeholder so a
 *  Draft Export can proceed. Completed images are preserved. */
export async function markRemainingAsPlaceholders(): Promise<number> {
  if (!runner) return 0;
  const targets = [...items.entries()]
    .filter(([, s]) => s !== "done")
    .map(([n]) => n)
    .sort((a, b) => a - b);
  for (const n of targets) {
    await skipSceneWithPlaceholder(n);
  }
  if (state === "running" || state === "cooling") {
    loopToken++;
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  }
  state = "done";
  currentScene = null;
  message = targets.length
    ? `Marked ${targets.length} scene(s) as placeholders.`
    : "No missing scenes to mark.";
  emit();
  return targets.length;
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
    const scene = sceneMap.get(n);
    if (!scene) {
      setItem(n, "failed");
      emit();
      continue;
    }
    currentScene = n;
    setItem(n, "running");
    emit();
    // One generateSceneImage() call per scene. A failure marks the scene failed
    // and the queue moves on; completed images are never regenerated.
    try {
      const image = await generateSceneImage(scene);
      if (token !== loopToken) return; // paused mid-request
      activeKeyName = "Puter AI / Pollinations";
      activeModel = "puter-txt2img / flux";
      await runner.save(scene, image); // save only valid images
      setItem(n, "done");
    } catch (e) {
      if (token !== loopToken) return;
      setItem(n, "failed");
      message = `Scene ${n}: ${imageErrorMessage(e, "Image generation failed.")}`;
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
