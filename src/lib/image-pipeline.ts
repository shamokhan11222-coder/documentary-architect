// Unified zero-budget image pipeline shared by Storyboard Images and Thumbnails.
//
// Provider order is fixed: Pollinations (primary) -> Puter AI (fallback).
// Gemini / OpenAI / Recraft / built-in image AI are NEVER called here — they
// remain selectable in API Settings only as disabled future providers, and a
// hard runtime guard throws before any network call if one is attempted.
//
// For every scene / thumbnail:
//   1. Try Pollinations once (deterministic seed, MS-Paint style prompt).
//   2. If Pollinations fails, automatically fall back to Puter.
// The exact provider error is preserved internally for the Developer debug report.
import { puterGenerateImage, PuterError, setPuterStatus } from "./puter-image";
import { pollinationsGenerateImage, PollinationsError, setPollinationsStatus } from "./pollinations-image";
import { recordTelemetry } from "./provider-telemetry";
import { recordErrorDetails } from "./error-details";

export type ImageProviderName = "puter" | "pollinations";

/** Providers that must NEVER render storyboard/thumbnail pixels. Attempting any
 *  of these stops before the network call. */
const FORBIDDEN_IMAGE_PROVIDERS = ["gemini", "openai", "recraft", "builtin", "built-in", "fal", "replicate", "huggingface"];

/** Hard runtime guard: reject any unsupported image provider before a request. */
export function assertSupportedImageProvider(name: string | undefined, context: "scene" | "thumbnail" = "scene") {
  if (name && FORBIDDEN_IMAGE_PROVIDERS.includes(name.toLowerCase())) {
    if (context === "thumbnail") throw new Error("BUG: Unsupported thumbnail image provider attempted.");
    throw new Error("BUG: Unsupported image provider attempted in Zero-Budget Mode.");
  }
}

export interface PipelineResult {
  image: string; // permanent data URL
  provider: ImageProviderName;
  model: string;
  seed: number;
  ms: number;
}

export interface PipelineDebugEntry {
  flowId: number;
  provider: ImageProviderName;
  model: string;
  scene?: number;
  functionInvoked: string;
  finalProviderRoute: string;
  requestUrl: string;
  requestDomain: string;
  startedAt: number;
  responseMs: number;
  error?: string;
  fallbackUsed?: boolean;
  ok: boolean;
}

const debugLog: PipelineDebugEntry[] = [];
const MAX_DEBUG = 200;
let flowCounter = 0;

export function getImagePipelineDebug(): PipelineDebugEntry[] {
  return [...debugLog];
}
export function clearImagePipelineDebug() {
  debugLog.length = 0;
}
function pushDebug(e: PipelineDebugEntry) {
  debugLog.push(e);
  if (debugLog.length > MAX_DEBUG) debugLog.splice(0, debugLog.length - MAX_DEBUG);
}

export function buildDebugReport(): string {
  return debugLog
    .map((e) => {
      const t = new Date(e.startedAt).toISOString();
      const scene = e.scene != null ? ` scene#${e.scene}` : "";
      const status = e.ok ? "OK" : `FAIL: ${e.error ?? "unknown"}`;
      const fb = e.fallbackUsed ? " [fallback]" : "";
      return `${t} flow#${e.flowId}${scene} ${e.functionInvoked} ${e.provider}/${e.model}${fb} ${e.responseMs}ms ${e.requestDomain} ${status}`;
    })
    .join("\n");
}

// ---- deterministic seeds ----
const POLLINATIONS_MODEL = "flux";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 1_000_000;
}

/** Stable base seed derived from the active project id. */
export function baseProjectSeed(): number {
  if (typeof window === "undefined") return 12345;
  try {
    const id = JSON.parse(localStorage.getItem("docos.selectedTopic") ?? "null");
    if (typeof id === "string" && id) return hashString(id);
  } catch {
    /* ignore */
  }
  return 12345;
}

/** Deterministic per-scene seed = base project seed + scene number. */
export function sceneSeed(sceneNumber: number): number {
  return (baseProjectSeed() + sceneNumber) % 1_000_000;
}

const PUTER_REQUEST_URL = "puter.ai.txt2img(browser-sdk)";
const POLLINATIONS_REQUEST_URL = "https://image.pollinations.ai/prompt/[encoded-prompt]";

async function tryPuter(prompt: string, scene: number | undefined, flowId: number): Promise<string> {
  const startedAt = Date.now();
  try {
    const image = await puterGenerateImage(prompt);
    pushDebug({
      flowId,
      provider: "puter",
      model: "puter-txt2img",
      scene,
      functionInvoked: "generatePipelineImage → puterGenerateImage",
      finalProviderRoute: "Puter AI primary → Pollinations fallback",
      requestUrl: PUTER_REQUEST_URL,
      requestDomain: "puter.ai browser SDK",
      startedAt,
      responseMs: Date.now() - startedAt,
      ok: true,
    });
    recordTelemetry({ lastProvider: "puter", lastStatus: "success", lastError: null });
    return image;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushDebug({
      flowId,
      provider: "puter",
      model: "puter-txt2img",
      scene,
      functionInvoked: "generatePipelineImage → puterGenerateImage",
      finalProviderRoute: "Puter AI primary → Pollinations fallback",
      requestUrl: PUTER_REQUEST_URL,
      requestDomain: "puter.ai browser SDK",
      startedAt,
      responseMs: Date.now() - startedAt,
      ok: false,
      error: msg,
    });
    recordTelemetry({ lastProvider: "puter", lastStatus: "error", lastError: msg });
    throw e;
  }
}

async function tryPollinations(prompt: string, seed: number, opts: { width: number; height: number }, scene: number | undefined, flowId: number): Promise<string> {
  const startedAt = Date.now();
  try {
    const image = await pollinationsGenerateImage(prompt, { ...opts, seed, model: POLLINATIONS_MODEL });
    pushDebug({
      flowId,
      provider: "pollinations",
      model: POLLINATIONS_MODEL,
      scene,
      functionInvoked: "generatePipelineImage → pollinationsGenerateImage",
      finalProviderRoute: "Puter AI primary → Pollinations fallback",
      requestUrl: POLLINATIONS_REQUEST_URL,
      requestDomain: "image.pollinations.ai",
      startedAt,
      responseMs: Date.now() - startedAt,
      ok: true,
      fallbackUsed: true,
    });
    recordTelemetry({ lastProvider: "pollinations", lastStatus: "success", lastError: null });
    return image;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushDebug({
      flowId,
      provider: "pollinations",
      model: POLLINATIONS_MODEL,
      scene,
      functionInvoked: "generatePipelineImage → pollinationsGenerateImage",
      finalProviderRoute: "Puter AI primary → Pollinations fallback",
      requestUrl: POLLINATIONS_REQUEST_URL,
      requestDomain: "image.pollinations.ai",
      startedAt,
      responseMs: Date.now() - startedAt,
      ok: false,
      error: msg,
      fallbackUsed: true,
    });
    recordTelemetry({ lastProvider: "pollinations", lastStatus: "error", lastError: msg });
    throw e;
  }
}

export interface PipelineOptions {
  seed?: number;
  scene?: number;
  width?: number;
  height?: number;
  /** Force a specific single provider (used by the per-provider test buttons). */
  only?: ImageProviderName;
  /** What is being rendered — drives the correct guard error message. */
  purpose?: "scene" | "thumbnail";
}

/**
 * Generate one image via Pollinations -> Puter. Throws only when BOTH providers
 * fail; the caller (queue) then marks that single scene as Retry Waiting and
 * continues to the next scene.
 */
export async function generatePipelineImage(prompt: string, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const purpose = opts.purpose ?? "scene";
  // Hard guard: block Gemini / OpenAI / Recraft / built-in before any request.
  assertSupportedImageProvider((opts as { only?: string }).only, purpose);
  const flowId = ++flowCounter;
  console.info("[image-flow] started", {
    flowId,
    activeProvider: "pollinations",
    functionInvoked: "generatePipelineImage",
    finalProviderRoute: "Pollinations primary → Puter AI fallback",
    requestUrl: POLLINATIONS_REQUEST_URL,
  });
  const start = Date.now();
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const seed = opts.seed ?? sceneSeed(opts.scene ?? 0);

  // Explicit single-provider test path.
  if (opts.only === "pollinations") {
    const image = await tryPollinations(prompt, seed, { width, height }, opts.scene, flowId);
    return { image, provider: "pollinations", model: POLLINATIONS_MODEL, seed, ms: Date.now() - start };
  }
  if (opts.only === "puter") {
    const image = await tryPuter(prompt, opts.scene, flowId);
    setPuterStatus("connected");
    return { image, provider: "puter", model: "puter-txt2img", seed, ms: Date.now() - start };
  }

  // 1) Pollinations first (primary).
  try {
    const image = await tryPollinations(prompt, seed, { width, height }, opts.scene, flowId);
    return { image, provider: "pollinations", model: POLLINATIONS_MODEL, seed, ms: Date.now() - start };
  } catch (firstErr) {
    // 2) Automatic Puter fallback.
    try {
      const image = await tryPuter(prompt, opts.scene, flowId);
      setPuterStatus("connected");
      return { image, provider: "puter", model: "puter-txt2img", seed, ms: Date.now() - start };
    } catch (fallbackErr) {
      recordErrorDetails(fallbackErr, { provider: "puter" });
      const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const secondMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`Both providers failed. Pollinations: ${firstMsg} | Puter: ${secondMsg}`);
    }
  }
}

/** Deprecated: the full documentary style + negative prompt now live inside the
 *  prompt compiler (style-lock.ts). Kept empty so existing call sites that
 *  append it do not double up style text. */
export const CONSISTENCY_SUFFIX = "";

export { PuterError, PollinationsError };
