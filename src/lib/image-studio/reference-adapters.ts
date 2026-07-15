// Reference-mode image provider adapters.
//
// A reference-capable adapter accepts one or more input images alongside the
// text prompt and returns a single 16:9 image. Free-mode providers
// (Pollinations, Puter) do NOT implement this interface — Reference Studio
// never sends uploaded images to them, and the UI warns the user of that.
import { lovableGatewayGenerateImage, LovableGatewayError } from "@/lib/lovable-gateway-image";
import { LOVABLE_GATEWAY_MODELS } from "@/lib/lovable-gateway-image";

export type ReferenceAdapterId = "lovable-gateway";

export interface ReferenceAdapterInput {
  prompt: string;
  subjectReferences: string[];
  styleReferences: string[];
  environmentReferences: string[];
  compositionReferences?: string[];
  width?: number;
  height?: number;
  strength?: number;
  seed?: number;
}

export interface ReferenceAdapterResult {
  image: string;
  provider: string;
  model: string;
  ms: number;
}

export interface ReferenceAdapter {
  id: ReferenceAdapterId;
  label: string;
  description: string;
  /** True when the adapter is configured and callable on this device. */
  isAvailable(): Promise<boolean>;
  generateWithReferences(input: ReferenceAdapterInput): Promise<ReferenceAdapterResult>;
}

// ---- Lovable Gateway adapter (Gemini image models with image inputs) ----
const lovableGateway: ReferenceAdapter = {
  id: "lovable-gateway",
  label: "Lovable Gateway (Gemini Image)",
  description:
    "Uses Gemini image models that accept text + up to 2 reference images per request.",
  async isAvailable() {
    // /api/generate-image reads LOVABLE_API_KEY server-side. We can't inspect
    // it from the browser, so we ping the route with a HEAD-style OPTIONS.
    // If the route exists the adapter is considered available; a real
    // credit/config failure surfaces at call time with a clear error.
    try {
      const res = await fetch("/api/generate-image", { method: "OPTIONS" });
      return res.status < 500;
    } catch {
      return false;
    }
  },
  async generateWithReferences(input) {
    // Prioritise subject refs (identity) over style/environment when
    // trimming to the gateway's 2-image cap.
    const ordered = [
      ...input.subjectReferences,
      ...input.styleReferences,
      ...input.environmentReferences,
      ...(input.compositionReferences ?? []),
    ].filter(Boolean);
    try {
      const res = await lovableGatewayGenerateImage(input.prompt, {
        width: input.width ?? 1280,
        height: input.height ?? 720,
        purpose: "storyboard",
        model: LOVABLE_GATEWAY_MODELS.balanced,
        references: ordered,
      });
      return { image: res.image, provider: "lovable-gateway", model: res.model, ms: res.ms };
    } catch (e) {
      if (e instanceof LovableGatewayError) {
        throw new Error(`${e.code}: ${e.message}`);
      }
      throw e;
    }
  },
};

const REGISTRY: Record<ReferenceAdapterId, ReferenceAdapter> = {
  "lovable-gateway": lovableGateway,
};

export function listReferenceAdapters(): ReferenceAdapter[] {
  return Object.values(REGISTRY);
}

export function getReferenceAdapter(id: string): ReferenceAdapter | null {
  return (REGISTRY as Record<string, ReferenceAdapter>)[id] ?? null;
}