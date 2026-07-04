// Global client-side AI request queue.
//
// Every AI generation request in the app (topics, research, story, script
// analyzer, storyboard, images, thumbnails, SEO, rating, voice) is funneled
// through this single queue so we never fire parallel requests at Gemini or the
// built-in AI. It enforces:
//   - a concurrency limit (Generation Speed: Safe=1 / Balanced=2 / Fast=3)
//   - a 3–5s cooldown between request starts
//   - automatic retry with exponential backoff (5s, 15s, 30s, 60s) on rate limits
//   - Stop / Resume of the whole queue
//   - per-task status: pending, running, waiting, retrying, completed, failed
//
// State is in-memory (per browser tab) and exposed reactively via
// useSyncExternalStore. Settings (speed) and paused flag are persisted.
import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./local";

export type QueueTaskStatus =
  | "pending"
  | "running"
  | "waiting"
  | "retrying"
  | "completed"
  | "failed";

export type GenerationSpeed = "safe" | "balanced" | "fast";

export interface QueueTask {
  id: string;
  label: string;
  status: QueueTaskStatus;
  attempt: number;
  message?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface Snapshot {
  tasks: QueueTask[];
  counts: Record<QueueTaskStatus, number>;
  paused: boolean;
  speed: GenerationSpeed;
  concurrency: number;
}

const SPEED_KEY = "docos.queue.speed";
const PAUSED_KEY = "docos.queue.paused";

const COOLDOWN_MIN = 3000; // 3s
const COOLDOWN_MAX = 5000; // 5s
// Auto-retry backoff schedule for rate-limit errors.
const BACKOFF = [5000, 15000, 30000, 60000];

export const SPEED_CONCURRENCY: Record<GenerationSpeed, number> = {
  safe: 1,
  balanced: 2,
  fast: 3,
};

// ---- internal reactive state ----
interface InternalTask extends QueueTask {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  retryRateLimits: boolean;
}

const tasks: InternalTask[] = [];
const running = new Set<string>();
let lastStartAt = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
let snapshot: Snapshot = buildSnapshot();

function nextGap(): number {
  return COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
}

function getSpeed(): GenerationSpeed {
  const s = readLocal<GenerationSpeed>(SPEED_KEY, "safe");
  return s === "balanced" || s === "fast" ? s : "safe"; // default Safe Mode
}

function isPaused(): boolean {
  return readLocal<boolean>(PAUSED_KEY, false);
}

function buildSnapshot(): Snapshot {
  const counts: Record<QueueTaskStatus, number> = {
    pending: 0,
    running: 0,
    waiting: 0,
    retrying: 0,
    completed: 0,
    failed: 0,
  };
  const list: QueueTask[] = tasks.map((t) => {
    counts[t.status]++;
    return {
      id: t.id,
      label: t.label,
      status: t.status,
      attempt: t.attempt,
      message: t.message,
      error: t.error,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  });
  const speed = getSpeed();
  return {
    tasks: list,
    counts,
    paused: isPaused(),
    speed,
    concurrency: SPEED_CONCURRENCY[speed],
  };
}

function emit() {
  snapshot = buildSnapshot();
  listeners.forEach((l) => l());
}

function isRateLimit(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /\b429\b|rate.?limit|too many requests|resource_exhausted|quota|tier limit exceeded/i.test(msg);
}

function setStatus(t: InternalTask, status: QueueTaskStatus, message?: string) {
  t.status = status;
  t.message = message;
  t.updatedAt = Date.now();
  emit();
}

// Keep at most a handful of finished tasks around so the panel stays readable.
function pruneFinished() {
  const finished = tasks.filter(
    (t) => t.status === "completed" || t.status === "failed",
  );
  const keep = 12;
  if (finished.length > keep) {
    const remove = finished.slice(0, finished.length - keep);
    for (const r of remove) {
      const i = tasks.indexOf(r);
      if (i >= 0) tasks.splice(i, 1);
    }
  }
}

function schedulePump(delay: number) {
  if (pumpTimer) return;
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    pump();
  }, Math.max(0, delay));
}

function pump() {
  if (isPaused()) return;
  const concurrency = SPEED_CONCURRENCY[getSpeed()];

  while (running.size < concurrency) {
    const task = tasks.find((t) => t.status === "pending" || t.status === "waiting");
    if (!task) break;

    // Enforce cooldown between request starts so we never spam the provider.
    const since = Date.now() - lastStartAt;
    const gap = nextGap();
    if (lastStartAt > 0 && since < gap) {
      if (task.status !== "waiting") setStatus(task, "waiting", "Waiting before next request…");
      schedulePump(gap - since);
      return;
    }

    lastStartAt = Date.now();
    void startTask(task);
  }
}

async function startTask(task: InternalTask) {
  running.add(task.id);
  setStatus(task, "running", undefined);
  try {
    const result = await task.run();
    setStatus(task, "completed", undefined);
    task.resolve(result);
  } catch (e) {
    if (task.retryRateLimits && isRateLimit(e) && task.attempt < BACKOFF.length) {
      const wait = BACKOFF[task.attempt];
      task.attempt++;
      setStatus(task, "retrying", "Rate limited. Waiting before retry…");
      running.delete(task.id);
      // Pause the individual task; auto-retry after backoff. Do not fail the project.
      setTimeout(() => {
        // Re-queue for another attempt (respecting stop/resume + cooldown).
        setStatus(task, "pending", undefined);
        pump();
      }, wait);
      return;
    }
    task.error = e instanceof Error ? e.message : String(e);
    setStatus(task, "failed", task.error);
    task.reject(e);
  } finally {
    running.delete(task.id);
    pruneFinished();
    pump();
  }
}

let idc = 0;

/**
 * Enqueue an AI request. Returns a promise that resolves with the task result
 * (or rejects if it fails after all retries). All AI calls should go through here.
 */
export function enqueueAi<T>(
  run: () => Promise<T>,
  label = "AI request",
  options: { retryRateLimits?: boolean } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const task: InternalTask = {
      id: `q${++idc}-${Date.now()}`,
      label,
      status: "pending",
      attempt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      run: run as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      retryRateLimits: options.retryRateLimits !== false,
    };
    tasks.push(task);
    emit();
    pump();
  });
}

/** Manually retry a task that failed after all automatic retries. */
export function retryTask(id: string) {
  const t = tasks.find((x) => x.id === id);
  if (!t || t.status !== "failed") return;
  t.attempt = 0;
  t.error = undefined;
  setStatus(t, "pending", undefined);
  pump();
}

export function setGenerationSpeed(speed: GenerationSpeed) {
  writeLocal(SPEED_KEY, speed);
  emit();
  pump();
}

export function stopQueue() {
  writeLocal(PAUSED_KEY, true);
  emit();
}

export function resumeQueue() {
  writeLocal(PAUSED_KEY, false);
  emit();
  pump();
}

export function clearFinished() {
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i].status === "completed" || tasks[i].status === "failed") {
      tasks.splice(i, 1);
    }
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAiQueue(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
