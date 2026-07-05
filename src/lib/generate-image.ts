// Client helper for silent image generation. Builds the prompt behind the
// scenes and returns a data URL — the user never sees a prompt.
import { collectDnaReferences } from "./visual-dna";
import { getInstructionText } from "./instructions";
import { getVisualInstructions } from "./visual-instructions";
import { buildScenePrompt, buildThumbnailPrompt } from "./style-lock";
import { getCreditConfig } from "./credit-mode";
import {
  imageProviderPayload,
  thumbnailProviderPayload,
  fallbackImageProviderPayload,
  IMAGE_PROVIDER_NOT_CONNECTED,
} from "./provider";
import { enqueueAi } from "./ai-queue";
import { recordTelemetry } from "./provider-telemetry";
import { getFreeMode, FREE_MODE_DELAY_MS } from "./free-mode";
import { puterGenerateImage, PuterError, setPuterStatus } from "./puter-image";
import { recordErrorDetails, recordImageErrorDetails } from "./error-details";
import {
  getGeminiImageKeys,
  pickAvailableKey,
  markKeyUsed,
  markKeyCooldown,
  markKeyDisabled,
  isLimitError,
  isDailyLimit,
  isInvalidKeyOrModel,
} from "./gemini-image-keys";
import { GEMINI_IMAGE_MODEL_DEFAULT } from "./provider";
import type { VisualScene, ThumbnailIdea } from "./types";

/** Thrown when every Gemini image key is cooling down or disabled. The queue
 *  pauses and auto-resumes when a key becomes available. */
export const ALL_KEYS_COOLING_CODE = "ALL_COOLING";
export const ALL_KEYS_COOLING_MESSAGE =
  "All Gemini image keys are cooling down. Resume automatically when one becomes available.";

/** Result of a rotated image request — carries the key name used for live status. */
export interface RotatedImage {
  image: string;
  keyName: string;
}

/** Generate ONE image using the Gemini image key pool. Picks the first available
 *  key, and on RESOURCE_EXHAUSTED / quota / rate-limit cools it down and tries the
 *  next key; on invalid key / missing model disables it and tries the next.
 *  Throws ImageGenError(ALL_COOLING) when no key is available. */
async function callWithRotation(prompt: string, references: string[]): Promise<RotatedImage> {
  // Try keys until one succeeds or all are cooling/disabled.
  for (;;) {
    const key = pickAvailableKey();
    if (!key) {
      throw new ImageGenError(ALL_KEYS_COOLING_MESSAGE, ALL_KEYS_COOLING_CODE, null);
    }
    const payload: ImageProviderPayload = {
      name: "gemini",
      apiKey: key.key.trim(),
      imageModel: key.imageModel?.trim() || GEMINI_IMAGE_MODEL_DEFAULT,
      fallback: false,
    };
    try {
      console.info("[image][rotation] using key", { key: key.name });
      const image = await callImageApi(prompt, references, payload);
      markKeyUsed(key.id);
      lastImageRequestAt = Date.now();
      return { image, keyName: key.name };
    } catch (e) {
      lastImageRequestAt = Date.now();
      const status = e instanceof ImageGenError ? e.status : null;
      const code = e instanceof ImageGenError ? e.code : null;
      const msg =
        (e instanceof ImageGenError && e.debug?.providerMessage) ||
        (e instanceof Error ? e.message : String(e));
      // Invalid key / model not found → disable this key and move on.
      if (isInvalidKeyOrModel(msg, code, status) && !isLimitError(msg, code, status)) {
        console.warn("[image][rotation] disabling key", { key: key.name, reason: msg });
        markKeyDisabled(key.id, msg);
        continue;
      }
      // Quota / rate-limit / resource exhausted → cool this key down and move on.
      if (isLimitError(msg, code, status)) {
        markKeyCooldown(key.id, isDailyLimit(msg) ? "daily" : "limit");
        console.warn("[image][rotation] cooling key", { key: key.name, daily: isDailyLimit(msg) });
        continue;
      }
      // Any other error (timeout, network, server) is not key-specific — surface it.
      throw e;
    }
  }
}

/** True when the user has configured the Gemini image key pool (rotation on). */
export function hasGeminiImageKeyPool(): boolean {
  return getGeminiImageKeys().length > 0;
}

/** Generate a scene image through the key pool, returning the used key name. */
export async function generateSceneImageRotating(scene: VisualScene): Promise<RotatedImage> {
  const { hasCharacter, images } = await collectDnaReferences();
  const prompt = buildScenePrompt(scene, combinedArtDirection(), hasCharacter);
  const refs = images.slice(0, getCreditConfig().dnaReferences);
  return enqueueAi(() => callWithRotation(prompt, refs), "Image", { retryRateLimits: false });
}

function combinedArtDirection(): string {
  return [getVisualInstructions(), getInstructionText(), selectedVisualStyle()]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/** The Visual Style chosen at project creation, read from the active project so
 *  every Recraft prompt stays consistent with the user's selected look. */
function selectedVisualStyle(): string {
  if (typeof window === "undefined") return "";
  try {
    const id = JSON.parse(localStorage.getItem("docos.selectedTopic") ?? "null");
    if (!id) return "";
    const topics = JSON.parse(localStorage.getItem("docos.topics") ?? "[]") as Array<{ id: string; visualStyle?: string }>;
    const style = topics.find((t) => t?.id === id)?.visualStyle?.trim();
    return style ? `Visual style: ${style}.` : "";
  } catch {
    return "";
  }
}

type ImageProviderPayload = NonNullable<ReturnType<typeof imageProviderPayload>>;

/** Error thrown by the image pipeline, carrying the backend's machine code and
 *  HTTP status so the UI can show a specific message instead of a generic one. */
export class ImageGenError extends Error {
  code: string | null;
  status: number | null;
  debug: ImageErrorDebug | null;
  constructor(message: string, code: string | null, status: number | null, debug: ImageErrorDebug | null = null) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
    this.status = status;
    this.debug = debug;
  }
}

/** Verbatim provider debug payload returned by /api/generate-image on failure. */
export interface ImageErrorDebug {
  provider: string;
  model: string;
  endpoint: string;
  httpMethod?: string;
  httpStatus: number | null;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  requestId: string | null;
  retryAfter: string | null;
  code: string | null;
  errorType?: string | null;
  providerMessage: string;
  responseHeaders?: Record<string, string>;
  rawJson?: unknown;
  rawBody: string;
}

export const PROVIDER_FREE_TIER_LIMIT_MESSAGE =
  "Provider free tier limit reached. Try later or switch provider.";

/** Maps an image-generation error to a specific, user-facing message.
 *  Never collapses everything into a single generic "try again later" line. */
export function imageErrorMessage(err: unknown, fallback = "Image generation failed."): string {
  // Emergency Debug Mode: NEVER replace provider responses with generic UI text.
  // Always surface the exact provider status + message and record full debug.
  if (err instanceof ImageGenError && err.debug) {
    recordImageErrorDetails(err.debug);
    const d = err.debug;
    return `${d.provider}${d.httpStatus ? ` ${d.httpStatus}` : ""}: ${d.providerMessage}`;
  }
  recordErrorDetails(err, {
    provider: err instanceof ImageGenError ? "image-provider" : undefined,
  });
  if (err instanceof ImageGenError) {
    // No structured debug (timeout / no provider connected) — surface real text.
    if (err.code === "NO_PROVIDER") return err.message || "No image provider is connected.";
    if (err.code === "TIMEOUT") return err.message || "Request timed out. Provider may be slow or unavailable.";
    return err.message || fallback;
  }
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return raw || fallback;
}

/** Whether an error is a provider rate-limit (HTTP 429 / RATE_LIMIT code). */
export function isRateLimitError(err: unknown): boolean {
  if (err instanceof ImageGenError) return err.code === "RATE_LIMIT" || err.status === 429;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /\b429\b|rate.?limit|too many requests|resource_exhausted|tier limit exceeded/i.test(msg);
}

// Hard timeouts so a slow/unresponsive provider can never hang forever.
export const IMAGE_TIMEOUT_MS = 90_000;
export const THUMBNAIL_TIMEOUT_MS = 90_000;
const TIMEOUT_MESSAGE = "Request timed out. Provider may be slow or unavailable.";

/** fetch() that aborts after `ms` and reports a clear timeout error. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ImageGenError(TIMEOUT_MESSAGE, "TIMEOUT", null);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Timestamp of the last image request, used to enforce the Free Mode delay.
let lastImageRequestAt = 0;

export function getImageCooldownRemainingMs(): number {
  if (!getFreeMode() || lastImageRequestAt <= 0) return 0;
  return Math.max(0, FREE_MODE_DELAY_MS - (Date.now() - lastImageRequestAt));
}

// AUDIT: monotonic counter of image API requests actually sent from the client.
// One user click of "Generate Image" must produce exactly ONE increment here;
// provider limits are surfaced immediately and never retried endlessly.
let imageRequestAuditCount = 0;

async function callImageApi(prompt: string, references: string[], provider: ImageProviderPayload): Promise<string> {
  recordTelemetry({ lastProvider: provider.name, lastStatus: null, lastError: null });
  // Print the provider actually used before EVERY image request.
  const providerLabel =
    provider.name === "gemini"
      ? "Gemini Image"
      : provider.name.charAt(0).toUpperCase() + provider.name.slice(1);
  console.log(`Using provider: ${providerLabel}`);
  console.log(`Model: ${provider.imageModel ?? GEMINI_IMAGE_MODEL_DEFAULT}`);
  console.info("[image] request started", { provider: provider.name, model: provider.imageModel });
  // Puter AI generates entirely client-side via the browser SDK — no server call.
  if (provider.name === "puter") {
    try {
      const img = await Promise.race([
        puterGenerateImage(prompt),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new ImageGenError(TIMEOUT_MESSAGE, "TIMEOUT", null)), IMAGE_TIMEOUT_MS),
        ),
      ]);
      recordTelemetry({ lastProvider: "puter", lastStatus: "success", lastError: null });
      console.info("[image] response received", { provider: "puter" });
      return img;
    } catch (e) {
      if (e instanceof ImageGenError && e.code === "TIMEOUT") {
        recordTelemetry({ lastProvider: "puter", lastStatus: "error", lastError: e.message });
        console.error("[image] request failed", { provider: "puter", error: e.message });
        throw e;
      }
      const msg = e instanceof Error ? e.message : "Puter image generation failed";
      recordTelemetry({ lastProvider: "puter", lastStatus: "error", lastError: msg });
      console.error("[image] request failed", { provider: "puter", error: msg });
      const rateLimited = e instanceof PuterError && e.kind === "rate-limit";
      throw new ImageGenError(rateLimited ? `429 ${msg}` : msg, rateLimited ? "RATE_LIMIT" : "PROVIDER_ERROR", rateLimited ? 429 : null);
    }
  }
  const res = await fetchWithTimeout(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, references, provider }),
    },
    IMAGE_TIMEOUT_MS,
  );
  const auditNo = ++imageRequestAuditCount;
  const auditStart = Date.now();
  console.info("[AUDIT][image] request sent", {
    totalRequestsSent: auditNo,
    endpoint: "/api/generate-image",
    provider: provider.name,
    model: provider.imageModel ?? "(default)",
    time: new Date(auditStart).toISOString(),
  });
  if (!res.ok) {
    console.info("[AUDIT][image] response received", {
      totalRequestsSent: auditNo,
      endpoint: "/api/generate-image",
      provider: provider.name,
      model: provider.imageModel ?? "(default)",
      responseCode: res.status,
      ms: Date.now() - auditStart,
    });
    let msg = `Image generation failed (${res.status})`;
    let code: string | null = null;
    let debug: ImageErrorDebug | null = null;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
      if (j?.code) code = j.code;
      if (j?.debug) debug = j.debug as ImageErrorDebug;
    } catch {
      /* ignore */
    }
    // Emergency Debug: log the exact provider response verbatim.
    console.error("[image][DEBUG] provider error", {
      provider: debug?.provider ?? provider.name,
      model: debug?.model ?? provider.imageModel ?? "(default)",
      endpoint: debug?.endpoint ?? "/api/generate-image",
      httpStatus: debug?.httpStatus ?? res.status,
      requestId: debug?.requestId ?? null,
      retryAfter: debug?.retryAfter ?? null,
      code: debug?.code ?? code,
      providerMessage: debug?.providerMessage ?? msg,
      rawBody: debug?.rawBody ?? msg,
      durationMs: Date.now() - auditStart,
    });
    recordTelemetry({ lastProvider: provider.name, lastStatus: "error", lastError: msg });
    console.error("[image] request failed", { provider: provider.name, status: res.status, error: msg });
    // Keep a 429 prefix for legacy rate-limit detectors, but image queue retry is disabled.
    throw new ImageGenError(res.status === 429 ? `429 ${msg}` : msg, code, res.status, debug);
  }
  console.info("[AUDIT][image] response received", {
    totalRequestsSent: auditNo,
    endpoint: "/api/generate-image",
    provider: provider.name,
    model: provider.imageModel ?? "(default)",
    responseCode: res.status,
    ms: Date.now() - auditStart,
  });
  const data = (await res.json()) as { image: string };
  recordTelemetry({ lastProvider: provider.name, lastStatus: "success", lastError: null });
  console.info("[image] response received", { provider: provider.name });
  return data.image;
}

async function generate(prompt: string, references: string[], provider = imageProviderPayload()): Promise<string> {
  if (!provider) throw new Error(IMAGE_PROVIDER_NOT_CONNECTED);
  const active: ImageProviderPayload = provider;
  return enqueueAi(async () => {
    // Puter AI: try the browser SDK first; if it is unavailable, automatically
    // fall back to Gemini or Recraft when one is connected. Provider limits stop.
    if (active.name === "puter") {
      try {
        const img = await callImageApi(prompt, references, active);
        lastImageRequestAt = Date.now();
        return img;
      } catch (e) {
        lastImageRequestAt = Date.now();
        if (isRateLimitError(e)) throw e;
        const fb = fallbackImageProviderPayload();
        if (fb && fb.name !== "puter") {
          console.error("[Puter] falling back to", fb.name, e);
          try {
            const img = await callImageApi(prompt, references, fb);
            setPuterStatus("connected");
            return img;
          } finally {
            lastImageRequestAt = Date.now();
          }
        }
        throw e;
      }
    }
    try {
      const img = await callImageApi(prompt, references, active);
      lastImageRequestAt = Date.now();
      return img;
    } catch (e) {
      // Never block for minutes on provider limits. Surface it immediately so the
      // queue can stop loading, mark the scene Provider Limit, and pause — the
      // user resumes later. The per-request 90s timeout guarantees no long hang.
      lastImageRequestAt = Date.now();
      throw e;
    }
  }, "Image", { retryRateLimits: false });
}

export async function testImageProvider(provider: ImageProviderPayload | null): Promise<void> {
  if (!provider) throw new Error(IMAGE_PROVIDER_NOT_CONNECTED);
  const res = await fetchWithTimeout(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, test: true }),
    },
    IMAGE_TIMEOUT_MS,
  );
  if (!res.ok) {
    let msg = `Image provider test failed (${res.status})`;
    let code: string | null = null;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
      if (j?.code) code = j.code;
    } catch {
      /* ignore */
    }
    recordTelemetry({ lastProvider: provider.name, lastStatus: "error", lastError: msg });
    throw new ImageGenError(msg, code, res.status);
  }
  recordTelemetry({ lastProvider: provider.name, lastStatus: "success", lastError: null });
}

export type GeminiModelInfo = { id: string; displayName: string };
export type GeminiModelList = {
  endpoint: string;
  apiVersion: string;
  imageModels: GeminiModelInfo[];
  allModels: string[];
};

export type GeminiDiagnostics = {
  ok: boolean;
  error?: string;
  host: string;
  endpoint?: string;
  apiVersion?: string;
  apiVersions?: string[];
  authMethod: string;
  authHeaderName?: string;
  usesBearer?: boolean;
  queryParameterUsage?: string;
  requestUrl?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
  fullRequest?: string;
  httpStatus?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  fullResponse?: string;
  ms?: number;
  imageModel?: string | null;
  model?: string | null;
  responseBody?: string;
};

/** Diagnostic: run a full raw Gemini connection check (no content generated).
 *  Returns the request URL, API version, HTTP status and full response body. */
export async function geminiDiagnostics(apiKey: string, imageModel?: string): Promise<GeminiDiagnostics> {
  const res = await fetchWithTimeout(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "geminiDiagnostics", apiKey, imageModel }),
    },
    IMAGE_TIMEOUT_MS,
  );
  return (await res.json()) as GeminiDiagnostics;
}

/** Diagnostic: list the Gemini models a key can access, filtered to image-capable
 *  ones. Returns the exact endpoint + API version used for debugging. */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelList> {
  const res = await fetchWithTimeout(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listGeminiModels", apiKey }),
    },
    IMAGE_TIMEOUT_MS,
  );
  if (!res.ok) {
    let msg = `Could not list Gemini models (${res.status})`;
    let code: string | null = null;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
      if (j?.code) code = j.code;
    } catch {
      /* ignore */
    }
    throw new ImageGenError(msg, code, res.status);
  }
  return (await res.json()) as GeminiModelList;
}

/** Validate a specific Gemini image model exists and works before saving it. */
export async function validateGeminiImageModel(apiKey: string, imageModel: string): Promise<void> {
  await testImageProvider({ name: "gemini", apiKey, imageModel, fallback: false });
}

export type ImageDiagCheck = {
  id: number;
  label: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  detail: string;
};
export type ImageDiagRaw = {
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
};
export type ImageDiagnostics = {
  model: string;
  apiVersion?: string;
  authMethod?: string;
  authHeaderName?: string;
  usesBearer?: boolean;
  queryParameterUsage?: string;
  checks: ImageDiagCheck[];
  modelsList: ImageDiagRaw;
  modelLookup: ImageDiagRaw;
  generationRequest: ImageDiagRaw;
};

/** Run the comprehensive Gemini IMAGE provider diagnostics (no image is
 *  generated). Returns PASS/FAIL checks plus the exact raw Google responses. */
export async function geminiImageDiagnostics(apiKey: string, imageModel?: string): Promise<ImageDiagnostics> {
  const res = await fetchWithTimeout(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "geminiImageDiagnostics", apiKey, imageModel }),
    },
    IMAGE_TIMEOUT_MS,
  );
  return (await res.json()) as ImageDiagnostics;
}

export async function generateSceneImage(scene: VisualScene): Promise<string> {
  const { hasCharacter, images } = await collectDnaReferences();
  const prompt = buildScenePrompt(scene, combinedArtDirection(), hasCharacter);
  return generate(prompt, images.slice(0, getCreditConfig().dnaReferences));
}

export async function generateThumbnailImage(idea: ThumbnailIdea): Promise<string> {
  const { images } = await collectDnaReferences();
  const prompt = buildThumbnailPrompt(idea, combinedArtDirection());
  return generate(prompt, images.slice(0, getCreditConfig().dnaReferences), thumbnailProviderPayload());
}

/** Result of the required one-image sanity test. Carries the exact provider,
 *  model, timing, and the real provider error so nothing is hidden. */
export type ImageSanityResult = {
  ok: boolean;
  provider: string;
  model: string;
  ms: number;
  image?: string;
  error?: string;
  rateLimited?: boolean;
};

export const IMAGE_SANITY_PROMPT = "simple blue circle on white background";

/** Generate exactly ONE test image with the active image provider using a
 *  trivial prompt. Never runs the storyboard. Surfaces the exact provider,
 *  model, request time and real error. Hard-capped at 90s by callImageApi. */
export async function generateTestImage(): Promise<ImageSanityResult> {
  const provider = imageProviderPayload();
  if (!provider) {
    return { ok: false, provider: "none", model: "—", ms: 0, error: IMAGE_PROVIDER_NOT_CONNECTED };
  }
  const start = Date.now();
  try {
    const image = await callImageApi(IMAGE_SANITY_PROMPT, [], provider);
    return {
      ok: true,
      provider: provider.name,
      model: provider.imageModel ?? "(default)",
      ms: Date.now() - start,
      image,
    };
  } catch (e) {
    return {
      ok: false,
      provider: provider.name,
      model: provider.imageModel ?? "(default)",
      ms: Date.now() - start,
      error: imageErrorMessage(e),
      rateLimited: isRateLimitError(e),
    };
  }
}