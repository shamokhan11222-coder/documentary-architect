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
import type { VisualScene, ThumbnailIdea } from "./types";

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
  constructor(message: string, code: string | null, status: number | null) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
    this.status = status;
  }
}

/** Maps an image-generation error to a specific, user-facing message.
 *  Never collapses everything into a single generic "try again later" line. */
export function imageErrorMessage(err: unknown, fallback = "Image generation failed."): string {
  if (err instanceof ImageGenError) {
    switch (err.code) {
      case "NO_PROVIDER":
        return "No image provider is connected.";
      case "TIMEOUT":
        return "Request timed out. Provider may be slow or unavailable.";
      case "UNSUPPORTED_TASK":
        return "Gemini provider is connected but this task is not supported by the selected model.";
      case "AUTH_ERROR":
        return "Invalid API key.";
      case "RATE_LIMIT":
        return "Rate limit exceeded.";
      case "CREDITS_EXHAUSTED":
      case "PROVIDER_ERROR":
      case "BAD_REQUEST":
        // Surface the real provider/backend error text.
        return err.message || fallback;
      default:
        return err.message || fallback;
    }
  }
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return raw || fallback;
}

/** Whether an error is a provider rate-limit (HTTP 429 / RATE_LIMIT code). */
export function isRateLimitError(err: unknown): boolean {
  if (err instanceof ImageGenError) return err.code === "RATE_LIMIT" || err.status === 429;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /\b429\b|rate.?limit|too many requests|resource_exhausted|quota/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// AUDIT: monotonic counter of image API requests actually sent from the client.
// One user click of "Generate Image" must produce exactly ONE increment here
// (retries only happen after a 429 and are logged with attempt info).
let imageRequestAuditCount = 0;

async function callImageApi(prompt: string, references: string[], provider: ImageProviderPayload): Promise<string> {
  recordTelemetry({ lastProvider: provider.name, lastStatus: null, lastError: null });
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
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
      if (j?.code) code = j.code;
    } catch {
      /* ignore */
    }
    recordTelemetry({ lastProvider: provider.name, lastStatus: "error", lastError: msg });
    console.error("[image] request failed", { provider: provider.name, status: res.status, error: msg });
    // Keep the "429 " prefix so the shared AI queue's rate-limit retry still triggers.
    throw new ImageGenError(res.status === 429 ? `429 ${msg}` : msg, code, res.status);
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
  const free = getFreeMode();
  return enqueueAi(async () => {
    // Puter AI: try the browser SDK first; if it is unavailable or rate limited,
    // automatically fall back to Gemini or Recraft when one is connected.
    if (active.name === "puter") {
      try {
        return await callImageApi(prompt, references, active);
      } catch (e) {
        const fb = fallbackImageProviderPayload();
        if (fb && fb.name !== "puter") {
          console.error("[Puter] falling back to", fb.name, e);
          const img = await callImageApi(prompt, references, fb);
          setPuterStatus("connected");
          return img;
        }
        throw e;
      }
    }
    // Free Mode: enforce a minimum 60s gap between image requests.
    if (free && lastImageRequestAt > 0) {
      const since = Date.now() - lastImageRequestAt;
      if (since < FREE_MODE_DELAY_MS) await sleep(FREE_MODE_DELAY_MS - since);
    }
    try {
      const img = await callImageApi(prompt, references, active);
      lastImageRequestAt = Date.now();
      return img;
    } catch (e) {
      // Never block for minutes on a rate limit. Surface it immediately so the
      // queue can stop loading, mark the scene "Rate Limited", and pause — the
      // user resumes later. The per-request 90s timeout guarantees no long hang.
      lastImageRequestAt = Date.now();
      throw e;
    }
  }, "Image");
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