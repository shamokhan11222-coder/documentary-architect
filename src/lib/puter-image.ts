// PuterImageProvider — browser-only image generation via the official Puter.js
// SDK (https://js.puter.com/v2/). Puter runs entirely client-side and needs no
// API key for image generation. This module loads/awaits the SDK, tracks a
// clear provider status (Connected / Generating / Rate Limited / Offline), and
// exposes a single generate() call. All failures are surfaced as typed errors
// and logged — they never crash the UI.
import { readLocal, writeLocal, useLocal } from "./local";

const STATUS_KEY = "docos.image.puter.status";

export type PuterStatus = "idle" | "connected" | "generating" | "rate-limited" | "offline";

export function getPuterStatus(): PuterStatus {
  return readLocal<PuterStatus>(STATUS_KEY, "idle");
}
export function usePuterStatus(): PuterStatus {
  return useLocal<PuterStatus>(STATUS_KEY, "idle");
}
export function setPuterStatus(s: PuterStatus) {
  writeLocal<PuterStatus>(STATUS_KEY, s);
}

/** Typed Puter error so callers can distinguish rate-limit / offline. */
export class PuterError extends Error {
  kind: "rate-limit" | "offline" | "error";
  constructor(message: string, kind: "rate-limit" | "offline" | "error") {
    super(message);
    this.name = "PuterError";
    this.kind = kind;
  }
}

interface PuterSDK {
  ai?: { txt2img?: (prompt: string, testMode?: boolean) => Promise<HTMLImageElement | string> };
}

function puterGlobal(): PuterSDK | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { puter?: PuterSDK }).puter ?? null;
}

/** Wait for the Puter SDK script (loaded in __root head) to be ready. */
async function ensurePuter(): Promise<PuterSDK> {
  if (typeof window === "undefined") throw new PuterError("Puter is browser-only.", "offline");
  for (let i = 0; i < 40; i++) {
    const p = puterGlobal();
    if (p?.ai?.txt2img) return p;
    await new Promise((r) => setTimeout(r, 250));
  }
  setPuterStatus("offline");
  throw new PuterError("Puter AI is unavailable (SDK not loaded).", "offline");
}

function isRateLimit(message: string): boolean {
  return /rate.?limit|too many requests|quota|resource_exhausted|\b429\b|usage.?limit|delinquent|insufficient/i.test(
    message,
  );
}

/** Generate one image with Puter AI. Returns a data/URL string. */
export async function puterGenerateImage(prompt: string): Promise<string> {
  setPuterStatus("generating");
  let puter: PuterSDK;
  try {
    puter = await ensurePuter();
  } catch (e) {
    console.error("[Puter] SDK not available:", e);
    throw e;
  }
  try {
    const result = await puter.ai!.txt2img!(prompt);
    const src = typeof result === "string" ? result : result?.src ?? "";
    if (!src) throw new PuterError("Puter returned no image.", "error");
    setPuterStatus("connected");
    return src;
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Puter image generation failed.";
    console.error("[Puter] image generation error:", e);
    if (isRateLimit(msg)) {
      setPuterStatus("rate-limited");
      throw new PuterError(msg, "rate-limit");
    }
    if (e instanceof PuterError) throw e;
    // Network/availability failures are treated as offline so we can fall back.
    setPuterStatus("offline");
    throw new PuterError(msg, "offline");
  }
}
