// Persisted "Retry Waiting" state for a thumbnail whose free-mode providers
// are temporarily unavailable. Survives page refresh, tracks attempt count and
// scheduled next-retry time. Only the thumbnail queue uses this — storyboard
// image queue, voice, sync, director, SEO are untouched.
import { useSyncExternalStore } from "react";

export type ThumbRetryStatus = "idle" | "waiting" | "unavailable";

export interface ThumbRetryJob {
  topicId: string;
  ideaIndex: number;
  attempts: number;
  nextRetryAt: number | null;
  status: ThumbRetryStatus;
  lastError: string | null;
  updatedAt: number;
}

/** Retry schedule (ms) — attempt 1 immediate, 2 after 90s, 3 after 3 min. */
export const RETRY_SCHEDULE_MS = [0, 90_000, 180_000];
export const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length;

const KEY = "docos.thumbnail.retry.v1";

type State = Record<string, ThumbRetryJob>;
function read(): State {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as State;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}

let cache: State = read();
const listeners = new Set<() => void>();
function persist() {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota */ }
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

export function getThumbRetry(topicId: string | null | undefined): ThumbRetryJob | null {
  if (!topicId) return null;
  return cache[topicId] ?? null;
}

export function useThumbRetry(topicId: string | null | undefined): ThumbRetryJob | null {
  return useSyncExternalStore(
    subscribe,
    () => (topicId ? cache[topicId] ?? null : null),
    () => null,
  );
}

/** Note a failed thumbnail attempt. Sets status = waiting until MAX_ATTEMPTS. */
export function recordThumbFailure(topicId: string, ideaIndex: number, error: string): ThumbRetryJob {
  const prev = cache[topicId] ?? null;
  const attempts = (prev?.attempts ?? 0) + 1;
  const nextIdx = attempts; // 1st failure → schedule[1], 2nd → schedule[2]
  const waitMs = RETRY_SCHEDULE_MS[nextIdx];
  const done = attempts >= MAX_ATTEMPTS || waitMs === undefined;
  const job: ThumbRetryJob = {
    topicId,
    ideaIndex,
    attempts,
    nextRetryAt: done ? null : Date.now() + waitMs,
    status: done ? "unavailable" : "waiting",
    lastError: error,
    updatedAt: Date.now(),
  };
  cache = { ...cache, [topicId]: job };
  persist();
  return job;
}

/** Clear the retry state (called on success, upload, draft, or manual dismiss). */
export function clearThumbRetry(topicId: string) {
  if (!cache[topicId]) return;
  const { [topicId]: _drop, ...rest } = cache;
  void _drop;
  cache = rest;
  persist();
}

/** Reset attempt counter (used by "Retry Now"). */
export function resetThumbRetry(topicId: string) {
  const prev = cache[topicId];
  if (!prev) return;
  cache = { ...cache, [topicId]: { ...prev, attempts: 0, nextRetryAt: null, status: "idle", updatedAt: Date.now() } };
  persist();
}