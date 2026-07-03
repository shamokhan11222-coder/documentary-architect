// Tiny shared localStorage-backed reactive store used by V7 intelligence
// modules (preferences, knowledge base, API key vault). Mirrors the pattern
// already used in store.ts / instructions.ts so behaviour stays consistent.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  emit();
}

export function useLocal<T>(key: string, fallback: T): T {
  const snap = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? "",
    () => "",
  );
  if (!snap) return fallback;
  const hit = parseCache.get(key);
  if (hit && hit.raw === snap) return hit.value as T;
  try {
    const value = JSON.parse(snap) as T;
    parseCache.set(key, { raw: snap, value });
    return value;
  } catch {
    return fallback;
  }
}

// Cache parsed values by (key, raw string) so an unchanged snapshot returns a
// stable object reference — prevents needless re-renders in consumers.
const parseCache = new Map<string, { raw: string; value: unknown }>();
