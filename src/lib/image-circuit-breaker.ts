// Provider circuit-breaker for free-mode image providers (Pollinations / Puter).
//
// Tracks rate-limits and failures per provider, enforces cooldowns and pauses
// the provider automatically when errors repeat inside a short window. State is
// persisted in localStorage so a refresh preserves the current cooldown /
// pause and the pending thumbnail-retry countdown.
//
// Scope: image providers only. Never touches OpenRouter, Voice, Voice Sync,
// Research, Story, SEO or the Director orchestrator.
import { useSyncExternalStore } from "react";

export type BreakerProvider = "pollinations" | "puter";

interface BreakerEntry {
  cooldownUntil: number; // wall-clock ms
  pausedUntil: number;   // wall-clock ms (circuit open)
  recent: number[];      // recent failure timestamps for windowed tripping
  lastError: string | null;
}

type BreakerState = Record<BreakerProvider, BreakerEntry>;

const KEY = "docos.image.breaker.v1";
const WINDOW_MS = 10 * 60 * 1000;
const POLL_PAUSE_MS = 15 * 60 * 1000;
const PUTER_PAUSE_MS = 10 * 60 * 1000;
export const DEFAULT_POLL_COOLDOWN_MS = 90 * 1000;
export const PUTER_COOLDOWN_MS = 60 * 1000;

function empty(): BreakerEntry {
  return { cooldownUntil: 0, pausedUntil: 0, recent: [], lastError: null };
}
function initial(): BreakerState {
  return { pollinations: empty(), puter: empty() };
}

function read(): BreakerState {
  if (typeof localStorage === "undefined") return initial();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const parsed = JSON.parse(raw) as Partial<BreakerState>;
    return { ...initial(), ...parsed };
  } catch {
    return initial();
  }
}

let cache: BreakerState = read();
const listeners = new Set<() => void>();
function emit() {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota */ }
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

/** Snapshot with derived "remaining ms" fields so the UI can render a countdown. */
export interface BreakerSnapshot {
  pollinations: { cooldownRemainingMs: number; pausedRemainingMs: number; lastError: string | null };
  puter:        { cooldownRemainingMs: number; pausedRemainingMs: number; lastError: string | null };
  nextAvailableAt: number | null;
}

function snapshotOf(now: number): BreakerSnapshot {
  const one = (p: BreakerProvider) => ({
    cooldownRemainingMs: Math.max(0, cache[p].cooldownUntil - now),
    pausedRemainingMs:   Math.max(0, cache[p].pausedUntil - now),
    lastError: cache[p].lastError,
  });
  const p = one("pollinations");
  const q = one("puter");
  const pollNext = Math.max(cache.pollinations.cooldownUntil, cache.pollinations.pausedUntil);
  const puterNext = Math.max(cache.puter.cooldownUntil, cache.puter.pausedUntil);
  const nextAvailableAt = Math.min(pollNext || Infinity, puterNext || Infinity);
  return { pollinations: p, puter: q, nextAvailableAt: Number.isFinite(nextAvailableAt) ? nextAvailableAt : null };
}

let snap: BreakerSnapshot = snapshotOf(Date.now());
function refreshSnap() { snap = snapshotOf(Date.now()); }

// Tick every second so live countdowns update without extra plumbing.
if (typeof window !== "undefined") {
  setInterval(() => { refreshSnap(); listeners.forEach((l) => l()); }, 1000);
}

export function useBreaker(): BreakerSnapshot {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

export function getBreaker(): BreakerSnapshot {
  refreshSnap();
  return snap;
}

/** Is this provider currently unavailable (cooldown OR paused)? */
export function isProviderAvailable(p: BreakerProvider): boolean {
  const now = Date.now();
  return cache[p].cooldownUntil <= now && cache[p].pausedUntil <= now;
}

function trimRecent(p: BreakerProvider, now: number) {
  cache[p].recent = cache[p].recent.filter((t) => now - t < WINDOW_MS);
}

/** Record a rate-limit hit. Uses `retryAfterMs` when the server sent one. */
export function noteRateLimit(p: BreakerProvider, retryAfterMs?: number, message?: string | null) {
  const now = Date.now();
  trimRecent(p, now);
  cache[p].recent.push(now);
  const wait = Math.max(1000, retryAfterMs ?? (p === "pollinations" ? DEFAULT_POLL_COOLDOWN_MS : PUTER_COOLDOWN_MS));
  cache[p].cooldownUntil = Math.max(cache[p].cooldownUntil, now + wait);
  if (cache[p].recent.length >= 2) {
    const pause = p === "pollinations" ? POLL_PAUSE_MS : PUTER_PAUSE_MS;
    cache[p].pausedUntil = Math.max(cache[p].pausedUntil, now + pause);
  }
  if (message) cache[p].lastError = message;
  refreshSnap();
  emit();
}

/** Record a non-429 failure (offline / error). Two failures in the window trip
 *  a shorter Puter pause; Pollinations non-429 failures just log the message. */
export function noteFailure(p: BreakerProvider, message?: string | null) {
  const now = Date.now();
  trimRecent(p, now);
  cache[p].recent.push(now);
  if (p === "puter" && cache[p].recent.length >= 2) {
    cache[p].pausedUntil = Math.max(cache[p].pausedUntil, now + PUTER_PAUSE_MS);
  }
  if (message) cache[p].lastError = message;
  refreshSnap();
  emit();
}

/** Reset a provider's cooldown/pause (used by the "Retry Now" button). */
export function resetBreaker(p?: BreakerProvider) {
  if (!p) cache = initial();
  else cache[p] = empty();
  refreshSnap();
  emit();
}

/** Parse a Retry-After header value (seconds OR HTTP-date). Returns ms or null. */
export function parseRetryAfter(v: string | null | undefined): number | null {
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const t = Date.parse(v);
  if (Number.isFinite(t)) return Math.max(0, t - Date.now());
  return null;
}