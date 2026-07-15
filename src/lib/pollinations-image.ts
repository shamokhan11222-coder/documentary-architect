// PollinationsImageProvider — browser-side, keyless image generation via the
// documented Pollinations image endpoint (https://image.pollinations.ai). Used
// as the automatic fallback when Puter AI is rate limited or unavailable.
import { readLocal, writeLocal, useLocal } from "./local";

const STATUS_KEY = "docos.image.pollinations.status";

export type PollinationsStatus =
  | "idle"
  | "ready"
  | "generating"
  | "rate-limited"
  | "unavailable"
  | "failed";

export function getPollinationsStatus(): PollinationsStatus {
  return readLocal<PollinationsStatus>(STATUS_KEY, "idle");
}
export function usePollinationsStatus(): PollinationsStatus {
  return useLocal<PollinationsStatus>(STATUS_KEY, "idle");
}
export function setPollinationsStatus(s: PollinationsStatus) {
  writeLocal<PollinationsStatus>(STATUS_KEY, s);
}

export class PollinationsError extends Error {
  kind: "rate-limit" | "unavailable" | "error";
  /** Milliseconds the caller must wait before retrying (from Retry-After). */
  retryAfterMs: number | null;
  constructor(message: string, kind: "rate-limit" | "unavailable" | "error", retryAfterMs: number | null = null) {
    super(message);
    this.name = "PollinationsError";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface PollinationsOptions {
  width?: number;
  height?: number;
  seed?: number;
  model?: string; // e.g. "flux"
  safe?: boolean;
}

const POLLINATIONS_TIMEOUT_MS = 90_000;

/** Read a Blob into a data URL so the image is stored permanently (never a
 *  temporary object URL). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Confirm the returned image actually decodes with non-zero dimensions. */
function verifyImage(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
      } else {
        reject(new PollinationsError("Pollinations returned a zero-size image.", "error"));
      }
    };
    img.onerror = () => reject(new PollinationsError("Pollinations image failed to load.", "error"));
    img.src = dataUrl;
  });
}

/** Generate one image with Pollinations. Returns a data URL (permanent). */
export async function pollinationsGenerateImage(
  prompt: string,
  opts: PollinationsOptions = {},
): Promise<string> {
  setPollinationsStatus("generating");
  const { width = 1024, height = 1024, seed, model = "flux", safe = false } = opts;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: "true",
    model,
  });
  if (typeof seed === "number") params.set("seed", String(seed));
  if (safe) params.set("safe", "true");
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), POLLINATIONS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const kind = res.status === 429 ? "rate-limit" : res.status >= 500 ? "unavailable" : "error";
      setPollinationsStatus(kind === "rate-limit" ? "rate-limited" : kind === "unavailable" ? "unavailable" : "failed");
      // Read Retry-After when the server sends one; the caller uses it to
      // schedule the next attempt precisely instead of the default 90s cooldown.
      let retryAfterMs: number | null = null;
      if (res.status === 429) {
        const h = res.headers.get("retry-after");
        if (h) {
          const secs = Number(h);
          if (Number.isFinite(secs) && secs >= 0) retryAfterMs = Math.round(secs * 1000);
          else {
            const t = Date.parse(h);
            if (Number.isFinite(t)) retryAfterMs = Math.max(0, t - Date.now());
          }
        }
      }
      throw new PollinationsError(`Pollinations HTTP ${res.status}`, kind, retryAfterMs);
    }
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") || blob.size === 0) {
      setPollinationsStatus("failed");
      throw new PollinationsError("Pollinations returned a non-image response.", "error");
    }
    const dataUrl = await blobToDataUrl(blob);
    await verifyImage(dataUrl);
    setPollinationsStatus("ready");
    return dataUrl;
  } catch (e) {
    if (e instanceof PollinationsError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      setPollinationsStatus("unavailable");
      throw new PollinationsError("Pollinations request timed out.", "unavailable");
    }
    setPollinationsStatus("unavailable");
    const msg = e instanceof Error ? e.message : "Pollinations request failed.";
    throw new PollinationsError(msg, "unavailable");
  } finally {
    clearTimeout(timer);
  }
}
