// Free Mode for image generation. When enabled (used with free-tier / rate-
// limited image providers), the pipeline generates ONE image at a time, waits a
// minimum delay between requests, and auto-retries rate-limited requests on a
// slow schedule instead of marking scenes as permanently failed.
import { readLocal, writeLocal, useLocal } from "./local";

const KEY = "docos.image.freeMode";
const DELAY_KEY = "docos.image.safeDelay";

/** Allowed delays (seconds) between image requests in slow/safe mode. */
export const SAFE_DELAY_OPTIONS = [10, 15, 30, 60] as const;
/** Default gap between image requests in slow/safe mode. */
export const FREE_MODE_DELAY_MS = 15_000; // 15s default
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

/** Configurable slow-mode delay between image requests (seconds). */
export function getSafeDelaySec(): number {
  const v = readLocal<number>(DELAY_KEY, 15);
  return SAFE_DELAY_OPTIONS.includes(v as (typeof SAFE_DELAY_OPTIONS)[number]) ? v : 15;
}
export function useSafeDelaySec(): number {
  const v = useLocal<number>(DELAY_KEY, 15);
  return SAFE_DELAY_OPTIONS.includes(v as (typeof SAFE_DELAY_OPTIONS)[number]) ? v : 15;
}
export function setSafeDelaySec(v: number) {
  writeLocal(DELAY_KEY, v);
}
