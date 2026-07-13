// Client helper for silent image generation. Builds the prompt behind the
// scenes and returns a data URL — the user never sees a prompt.
import { collectDnaReferences } from "./visual-dna";
import { getInstructionText } from "./instructions";
import { getVisualInstructions } from "./visual-instructions";
import { buildScenePrompt, buildThumbnailPrompt } from "./style-lock";
import { STYLE_CORRECTION_PREFIX } from "./style-lock";
import { enqueueAi } from "./ai-queue";
import { getFreeMode, FREE_MODE_DELAY_MS } from "./free-mode";
import {
  generatePipelineImage,
  sceneSeed,
  CONSISTENCY_SUFFIX,
  type ImageProviderName,
  type PipelineResult,
  type PipelineOptions,
} from "./image-pipeline";
import { recordErrorDetails, recordImageErrorDetails } from "./error-details";
import type { VisualScene, ThumbnailIdea } from "./types";

// Legacy Gemini image-key rotation has been fully removed. All storyboard and
// thumbnail pixels now flow through the single zero-budget pipeline
// (generatePipelineImage: Puter primary → Pollinations fallback). Gemini /
// OpenAI / Recraft remain visible in API Settings only as future providers.

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

type ZeroBudgetTestProvider = {
  name?: string;
  apiKey?: string;
  imageModel?: string;
  fallback?: boolean;
};

export const GEMINI_IMAGE_DISABLED_MESSAGE = "BUG: Gemini image provider is disabled in Zero-Budget Mode.";

function assertNotGeminiImageProvider(provider: { name?: string } | null | undefined) {
  if (provider?.name === "gemini") throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
}

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

// Timestamp of the last image request, used to enforce the Free Mode delay.
let lastImageRequestAt = 0;

export function getImageCooldownRemainingMs(): number {
  if (!getFreeMode() || lastImageRequestAt <= 0) return 0;
  return Math.max(0, FREE_MODE_DELAY_MS - (Date.now() - lastImageRequestAt));
}

// AUDIT: monotonic counter of image API requests actually sent from the client.
// One user click of "Generate Image" must produce exactly ONE increment here;
// provider limits are surfaced immediately and never retried endlessly.
export async function testImageProvider(provider: ZeroBudgetTestProvider | null): Promise<void> {
  if (!provider) throw new Error("Zero-Budget image mode is ready: Puter AI primary, Pollinations fallback.");
  assertNotGeminiImageProvider(provider);
  if (provider.name !== "puter" && provider.name !== "pollinations") {
    throw new Error("Image provider is disabled in Zero-Budget Mode. Use Puter AI or Pollinations.");
  }
  const r = await generateTestImage(provider.name);
  if (!r.ok) throw new Error(r.error ?? "Image provider test failed.");
}

export type GeminiModelInfo = { id: string; displayName: string };
export type GeminiModelList = {
  endpoint: string;
  requestUrl?: string;
  apiVersion: string;
  authMethod?: string;
  rawResponse?: string;
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
  void apiKey;
  void imageModel;
  throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
}

/** Diagnostic: list the Gemini models a key can access, filtered to image-capable
 *  ones. Returns the exact endpoint + API version used for debugging. */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelList> {
  void apiKey;
  throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
}

/** Validate a specific Gemini image model exists and works before saving it. */
export async function validateGeminiImageModel(apiKey: string, imageModel: string): Promise<void> {
  void apiKey;
  void imageModel;
  throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
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
  void apiKey;
  void imageModel;
  throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
}

export async function generateSceneImage(scene: VisualScene): Promise<string> {
  const { hasCharacter } = await collectDnaReferences();
  const prompt = `${buildScenePrompt(scene, combinedArtDirection(), hasCharacter)} ${CONSISTENCY_SUFFIX}`;
  const r = await enqueueAi(
    () => generatePipelineImage(prompt, { scene: scene.sceneNumber, seed: sceneSeed(scene.sceneNumber), width: 1280, height: 720 }),
    "Image",
    { retryRateLimits: false },
  );
  lastImageRequestAt = Date.now();
  return r.image;
}

// ---- Single normalized image result (Section 3) --------------------------
// Every consolidated image request returns this exact shape so no two provider
// paths can hand back incompatible results.
export interface ImageResult {
  success: boolean;
  provider: ImageProviderName;
  imageDataUrl?: string;
  permanentImageKey?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

function looksLikeImage(dataUrl: string): boolean {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image");
}

/** Decode a data URL and confirm it has non-zero width and height. A scene is
 *  only complete when this returns true (Section 4). */
export function validateImageDimensions(dataUrl: string): Promise<boolean> {
  if (typeof window === "undefined" || !looksLikeImage(dataUrl)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

/** Consolidated scene image request. Builds the prompt, calls the single
 *  pipeline (Puter → Pollinations), validates the returned pixels and returns
 *  one normalized result. Never throws — failures come back as success:false. */
export async function generateSceneImageResult(scene: VisualScene): Promise<ImageResult> {
  const start = Date.now();
  try {
    const { hasCharacter } = await collectDnaReferences();
    const prompt = `${buildScenePrompt(scene, combinedArtDirection(), hasCharacter)} ${CONSISTENCY_SUFFIX}`;
    const r = await enqueueAi(
      () => generatePipelineImage(prompt, { scene: scene.sceneNumber, seed: sceneSeed(scene.sceneNumber), width: 1280, height: 720 }),
      "Image",
      { retryRateLimits: false },
    );
    lastImageRequestAt = Date.now();
    const valid = await validateImageDimensions(r.image);
    if (!valid) {
      return { success: false, provider: r.provider, errorCode: "INVALID_IMAGE", errorMessage: "Image returned no valid pixels.", durationMs: Date.now() - start };
    }
    return { success: true, provider: r.provider, imageDataUrl: r.image, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      provider: "puter",
      errorCode: e instanceof ImageGenError ? e.code ?? undefined : undefined,
      errorMessage: imageErrorMessage(e),
      durationMs: Date.now() - start,
    };
  }
}

export async function generateThumbnailImage(idea: ThumbnailIdea): Promise<string> {
  const prompt = `${buildThumbnailPrompt(idea, combinedArtDirection())} ${CONSISTENCY_SUFFIX}`;
  const r = await enqueueAi(
    () => generatePipelineImage(prompt, { width: 1280, height: 720 }),
    "Thumbnail",
    { retryRateLimits: false },
  );
  lastImageRequestAt = Date.now();
  return r.image;
}

/** Consolidated thumbnail request — same shared pipeline as storyboard scenes
 *  (Section 2), returning the same normalized result shape. */
export async function generateThumbnailImageResult(idea: ThumbnailIdea): Promise<ImageResult> {
  const start = Date.now();
  try {
    const prompt = `${buildThumbnailPrompt(idea, combinedArtDirection())} ${CONSISTENCY_SUFFIX}`;
    const r = await enqueueAi(
      () => generatePipelineImage(prompt, { width: 1280, height: 720 }),
      "Thumbnail",
      { retryRateLimits: false },
    );
    lastImageRequestAt = Date.now();
    const valid = await validateImageDimensions(r.image);
    if (!valid) {
      return { success: false, provider: r.provider, errorCode: "INVALID_IMAGE", errorMessage: "Image returned no valid pixels.", durationMs: Date.now() - start };
    }
    return { success: true, provider: r.provider, imageDataUrl: r.image, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      provider: "puter",
      errorCode: e instanceof ImageGenError ? e.code ?? undefined : undefined,
      errorMessage: imageErrorMessage(e),
      durationMs: Date.now() - start,
    };
  }
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

export const IMAGE_SANITY_PROMPT =
  "One simple hand-drawn black stick figure standing beside a small green tree on a plain white background, flat colors, thick rough black outlines, single full-frame 16:9 illustration, no text, no panels.";

/** Generate exactly ONE test image with the zero-budget pipeline. `only`
 *  forces a single provider so the UI can offer separate Puter / Pollinations
 *  test buttons. Surfaces the exact provider, model, request time and real
 *  error, and returns a real image the caller can display and store. */
export async function generateTestImage(
  only?: "puter" | "pollinations",
): Promise<ImageSanityResult> {
  const start = Date.now();
  try {
    const r = await generatePipelineImage(IMAGE_SANITY_PROMPT, { seed: 7, only });
    return { ok: true, provider: r.provider, model: r.model, ms: Date.now() - start, image: r.image };
  } catch (e) {
    return {
      ok: false,
      provider: only ?? "puter",
      model: only === "pollinations" ? "flux" : "puter-txt2img",
      ms: Date.now() - start,
      error: imageErrorMessage(e),
      rateLimited: isRateLimitError(e),
    };
  }
}