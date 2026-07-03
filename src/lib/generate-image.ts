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
import type { VisualScene, ThumbnailIdea } from "./types";

function combinedArtDirection(): string {
  return [getVisualInstructions(), getInstructionText()]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

type ImageProviderPayload = NonNullable<ReturnType<typeof imageProviderPayload>>;

async function generate(prompt: string, references: string[], provider = imageProviderPayload()): Promise<string> {
  if (!provider) throw new Error(IMAGE_PROVIDER_NOT_CONNECTED);
  return enqueueAi(async () => {
    recordTelemetry({ lastProvider: provider.name, lastStatus: null, lastError: null });
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, references, provider }),
    });
    if (!res.ok) {
      let msg = `Image generation failed (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      // Preserve status so the queue can detect rate limits (429) and retry.
      recordTelemetry({ lastProvider: provider.name, lastStatus: "error", lastError: msg });
      throw new Error(res.status === 429 ? `429 ${msg}` : msg);
    }
    const data = (await res.json()) as { image: string };
    recordTelemetry({ lastProvider: provider.name, lastStatus: "success", lastError: null });
    return data.image;
  }, "Image");
}

export async function testImageProvider(provider: ImageProviderPayload): Promise<void> {
  if (!provider) throw new Error(IMAGE_PROVIDER_NOT_CONNECTED);
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, test: true }),
  });
  if (!res.ok) {
    let msg = `Image provider test failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    recordTelemetry({ lastProvider: provider.name, lastStatus: "error", lastError: msg });
    throw new Error(msg);
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