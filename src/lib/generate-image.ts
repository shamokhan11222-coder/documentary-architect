// Client helper for silent image generation. Builds the prompt behind the
// scenes and returns a data URL — the user never sees a prompt.
import { collectDnaReferences } from "./visual-dna";
import { getInstructionText } from "./instructions";
import { getVisualInstructions } from "./visual-instructions";
import { buildScenePrompt, buildThumbnailPrompt } from "./style-lock";
import { getCreditConfig } from "./credit-mode";
import { imageProviderPayload, thumbnailProviderPayload, IMAGE_PROVIDER_NOT_CONNECTED } from "./provider";
import { enqueueAi } from "./ai-queue";
import { recordTelemetry } from "./provider-telemetry";
import { getFreeMode, FREE_MODE_DELAY_MS, FREE_MODE_RETRY_MS } from "./free-mode";
import type { VisualScene, ThumbnailIdea } from "./types";

function combinedArtDirection(): string {
  return [getVisualInstructions(), getInstructionText()]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
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

// Timestamp of the last image request, used to enforce the Free Mode delay.
let lastImageRequestAt = 0;

async function callImageApi(prompt: string, references: string[], provider: ImageProviderPayload): Promise<string> {
  recordTelemetry({ lastProvider: provider.name, lastStatus: null, lastError: null });
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, references, provider }),
  });
  if (!res.ok) {
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
    // Keep the "429 " prefix so the shared AI queue's rate-limit retry still triggers.
    throw new ImageGenError(res.status === 429 ? `429 ${msg}` : msg, code, res.status);
  }
  const data = (await res.json()) as { image: string };
  recordTelemetry({ lastProvider: provider.name, lastStatus: "success", lastError: null });
  return data.image;
}

async function generate(prompt: string, references: string[], provider = imageProviderPayload()): Promise<string> {
  if (!provider) throw new Error(IMAGE_PROVIDER_NOT_CONNECTED);
  const free = getFreeMode();
  return enqueueAi(async () => {
    // Free Mode: enforce a minimum 60s gap between image requests.
    if (free && lastImageRequestAt > 0) {
      const since = Date.now() - lastImageRequestAt;
      if (since < FREE_MODE_DELAY_MS) await sleep(FREE_MODE_DELAY_MS - since);
    }
    try {
      const img = await callImageApi(prompt, references, provider);
      lastImageRequestAt = Date.now();
      return img;
    } catch (e) {
      // Outside Free Mode (or non-rate-limit errors), let the shared queue's
      // own backoff handle it.
      if (!free || !isRateLimitError(e)) throw e;
      // Free Mode: auto-retry rate-limited requests on a slow schedule.
      for (const wait of FREE_MODE_RETRY_MS) {
        await sleep(wait);
        try {
          const img = await callImageApi(prompt, references, provider);
          lastImageRequestAt = Date.now();
          return img;
        } catch (e2) {
          if (!isRateLimitError(e2)) throw e2;
        }
      }
      lastImageRequestAt = Date.now();
      // Message intentionally avoids the "rate limit" wording so the shared
      // queue does NOT retry again — the scene is left to resume later.
      throw new ImageGenError("Free provider limit reached. Continue later.", "RATE_LIMIT", 429);
    }
  }, "Image");
}

export async function testImageProvider(provider: ImageProviderPayload | null): Promise<void> {
  if (!provider) throw new Error(IMAGE_PROVIDER_NOT_CONNECTED);
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, test: true }),
  });
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