// Free Queue Mode for image generation. When enabled (used with free-tier /
// rate-limited image providers), the pipeline generates ONE image at a time,
// waits 120 seconds between requests, never runs parallel batches, and stops
// immediately on provider limits so completed work stays resumable.
import { readLocal, writeLocal, useLocal } from "./local";

const KEY = "docos.image.freeMode";
const DELAY_KEY = "docos.image.safeDelay";

/** Allowed delays (seconds) between image requests in manual safe mode. */
export const SAFE_DELAY_OPTIONS = [30, 60, 90] as const;
export const DEFAULT_SAFE_DELAY_SEC = 60;
export const FREE_QUEUE_DELAY_SEC = 120;
/** Fixed Free Queue Mode gap between image requests. */
export const FREE_MODE_DELAY_MS = FREE_QUEUE_DELAY_SEC * 1000;

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
  const v = readLocal<number>(DELAY_KEY, DEFAULT_SAFE_DELAY_SEC);
  return SAFE_DELAY_OPTIONS.includes(v as (typeof SAFE_DELAY_OPTIONS)[number]) ? v : DEFAULT_SAFE_DELAY_SEC;
}
export function useSafeDelaySec(): number {
  const v = useLocal<number>(DELAY_KEY, DEFAULT_SAFE_DELAY_SEC);
  return SAFE_DELAY_OPTIONS.includes(v as (typeof SAFE_DELAY_OPTIONS)[number]) ? v : DEFAULT_SAFE_DELAY_SEC;
}
export function setSafeDelaySec(v: number) {
  writeLocal(DELAY_KEY, v);
}
