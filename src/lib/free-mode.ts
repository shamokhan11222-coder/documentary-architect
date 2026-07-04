// Free Mode for image generation. When enabled (used with free-tier / rate-
// limited image providers), the pipeline generates ONE image at a time, waits a
// minimum delay between requests, and auto-retries rate-limited requests on a
// slow schedule instead of marking scenes as permanently failed.
import { readLocal, writeLocal, useLocal } from "./local";

const KEY = "docos.image.freeMode";

/** Minimum gap between image requests in Free Mode. */
export const FREE_MODE_DELAY_MS = 60_000; // 60s
/** Auto-retry schedule for rate-limited requests in Free Mode: 1m, 3m, 5m. */
export const FREE_MODE_RETRY_MS = [60_000, 180_000, 300_000];

export function getFreeMode(): boolean {
  return readLocal<boolean>(KEY, false);
}
export function useFreeMode(): boolean {
  return useLocal<boolean>(KEY, false);
}
export function setFreeMode(v: boolean) {
  writeLocal(KEY, v);
}
