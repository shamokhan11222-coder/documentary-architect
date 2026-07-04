// Active AI provider resolution (client side). Images are intentionally routed
// only to a real external image provider. The built-in AI is disabled for image
// generation and must never be used as a silent fallback.
import { readLocal, writeLocal, useLocal } from "./local";
import type { ApiKeyEntry } from "./types";

const KEY = "docos.apikeys";
const SETTINGS_KEY = "docos.provider.settings";

export type AiTask = "text" | "image" | "tts";

export interface ActiveProvider {
  name: "gemini";
  apiKey: string;
  textModel: string;
  imageModel: string;
  ttsModel: string;
}

export type ImageProviderName = "gemini" | "openai" | "fal" | "replicate" | "recraft" | "builtin";

export interface ActiveImageProvider {
  id: string;
  name: ImageProviderName;
  label: string;
  apiKey: string;
  imageModel: string;
  testPassed: boolean;
}

export const IMAGE_PROVIDER_NOT_CONNECTED =
  "Recraft is not connected. Add your Recraft API key in API Settings and test the connection.";
export const IMAGE_PROVIDER_TEST_PASSED = "Image provider test passed";

export const GEMINI_UNSUPPORTED_MESSAGE =
  "Gemini does not support this task in the current setup. Please connect another provider.";

// Tasks Gemini can handle in this setup. Kept as a map so the UI and the
// server can agree on what is/ isn't routable to Gemini.
export const GEMINI_SUPPORTS: Record<AiTask, boolean> = {
  text: true,
  image: true,
  tts: true,
};

// ---- Provider routing settings (which provider handles each task) ----
export type ProviderChoice = "gemini" | "builtin" | "openai" | "fal" | "replicate" | "recraft" | "disabled";

export interface ProviderSettings {
  text: ProviderChoice;
  image: ProviderChoice;
  voice: ProviderChoice;
  thumbnail: ProviderChoice;
  /** Fall back to built-in Lovable AI if the external provider fails. */
  fallback: boolean;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  text: "gemini",
  image: "recraft",
  voice: "gemini",
  thumbnail: "recraft",
  // Never silently fall back to the built-in AI. When Gemini is connected we
  // route to Gemini only and surface its real errors. Fallback is opt-in.
  fallback: false,
};

function normalizeSettings(s: Partial<ProviderSettings> | null): ProviderSettings {
  const next = { ...DEFAULT_PROVIDER_SETTINGS, ...(s ?? {}) };
  // Image generation must never touch the built-in AI. Any legacy/built-in
  // image routing is coerced to Recraft, the only supported image provider.
  if (next.image === "builtin" || next.image === "disabled") next.image = "recraft";
  return next;
}

/** Non-reactive read of routing settings. */
export function getProviderSettings(): ProviderSettings {
  return normalizeSettings(readLocal<Partial<ProviderSettings>>(SETTINGS_KEY, {}));
}

/** Reactive hook for routing settings. */
export function useProviderSettings(): ProviderSettings {
  return normalizeSettings(useLocal<Partial<ProviderSettings>>(SETTINGS_KEY, {}));
}

export function saveProviderSettings(next: Partial<ProviderSettings>) {
  writeLocal(SETTINGS_KEY, { ...getProviderSettings(), ...next });
}

function findGemini(list: ApiKeyEntry[]): ApiKeyEntry | null {
  return list.find((e) => e.provider === "Google Gemini" && e.apiKey.trim()) ?? null;
}

function findImageKey(choice: ProviderChoice, list: ApiKeyEntry[]): ApiKeyEntry | null {
  const provider =
    choice === "gemini"
      ? "Google Gemini"
      : choice === "openai"
        ? "OpenAI"
        : choice === "fal"
          ? "Fal.ai"
          : choice === "replicate"
            ? "Replicate"
            : choice === "recraft"
              ? "Recraft"
              : null;
  if (!provider) return null;
  return list.find((e) => e.provider === provider && e.apiKey.trim()) ?? null;
}

function defaultImageModel(choice: ProviderChoice): string {
  if (choice === "gemini") return "gemini-2.5-flash-image";
  if (choice === "openai") return "gpt-image-1";
  if (choice === "fal") return "fal-ai/flux/schnell";
  if (choice === "replicate") return "black-forest-labs/flux-schnell";
  if (choice === "recraft") return "recraftv4_1_utility_pro";
  return "";
}

function imageLabel(choice: ProviderChoice): string {
  if (choice === "gemini") return "Gemini Image";
  if (choice === "openai") return "OpenAI Images";
  if (choice === "fal") return "Fal.ai";
  if (choice === "replicate") return "Replicate";
  if (choice === "recraft") return "Recraft V4.1 Utility Pro";
  return "Built-in AI disabled";
}

function toImageProvider(choice: ProviderChoice, entry: ApiKeyEntry | null): ActiveImageProvider | null {
  if (!entry) return null;
  if (choice !== "gemini" && choice !== "openai" && choice !== "fal" && choice !== "replicate" && choice !== "recraft")
    return null;

  // For Gemini image, ONLY use models containing "image" in the name.
  // The user's text modelName (e.g. gemini-2.5-flash) must NOT be used for image gen.
  let imageModel = entry.modelName?.trim() || "";
  if (choice === "gemini") {
    // Force an image-capable model. Ignore text model names.
    imageModel = imageModel.toLowerCase().includes("image") ? imageModel : "gemini-2.5-flash-image";
  } else if (choice === "recraft") {
    // Force a Recraft image model. Ignore any label a user might have typed.
    imageModel = imageModel.toLowerCase().startsWith("recraft") ? imageModel : "recraftv4_1_utility_pro";
  } else if (!imageModel) {
    imageModel = defaultImageModel(choice);
  }

  return {
    id: entry.id,
    name: choice,
    label: imageLabel(choice),
    apiKey: entry.apiKey.trim(),
    imageModel,
    testPassed: entry.testResult === IMAGE_PROVIDER_TEST_PASSED,
  };
}

function toProvider(e: ApiKeyEntry | null): ActiveProvider | null {
  if (!e) return null;
  return {
    name: "gemini",
    apiKey: e.apiKey.trim(),
    textModel: e.modelName?.trim() || "gemini-2.5-flash",
    imageModel: "gemini-2.5-flash-image",
    ttsModel: "gemini-2.5-flash-preview-tts",
  };
}

/** Non-reactive read — safe in event handlers, fetch helpers and middleware. */
export function getActiveProvider(): ActiveProvider | null {
  return toProvider(findGemini(readLocal<ApiKeyEntry[]>(KEY, [])));
}

/** Reactive hook for UI. */
export function useActiveProvider(): ActiveProvider | null {
  const list = useLocal<ApiKeyEntry[]>(KEY, []);
  return toProvider(findGemini(list));
}

/** External image provider if the selected image choice has a connected key. */
export function getActiveImageProvider(): ActiveImageProvider | null {
  const choice = getProviderSettings().image;
  return toImageProvider(choice, findImageKey(choice, readLocal<ApiKeyEntry[]>(KEY, [])));
}

export function useActiveImageProvider(): ActiveImageProvider | null {
  const settings = useProviderSettings();
  const list = useLocal<ApiKeyEntry[]>(KEY, []);
  return toImageProvider(settings.image, findImageKey(settings.image, list));
}

export function getImageProviderStatus(): {
  choice: ProviderChoice;
  label: string;
  connected: boolean;
  testPassed: boolean;
  ok: boolean;
  message: string;
} {
  return statusFor(getProviderSettings().image, getActiveImageProvider());
}

export function useImageProviderStatus(): ReturnType<typeof getImageProviderStatus> {
  const settings = useProviderSettings();
  const list = useLocal<ApiKeyEntry[]>(KEY, []);
  return statusFor(settings.image, toImageProvider(settings.image, findImageKey(settings.image, list)));
}

/** Image generation requires a connected external image provider (Recraft).
 *  The built-in AI is never used for images. */
function statusFor(choice: ProviderChoice, external: ActiveImageProvider | null) {
  if (external) {
    return {
      choice,
      label: external.label,
      connected: true,
      testPassed: external.testPassed,
      ok: true,
      message: external.testPassed ? "Ready" : "Connected — click Test to verify.",
    };
  }
  return {
    choice,
    label: "Recraft V4.1 Utility Pro",
    connected: false,
    testPassed: false,
    ok: false,
    message: IMAGE_PROVIDER_NOT_CONNECTED,
  };
}

/** Body payload passed to the image API route so the server can route. Returns
 *  the connected external image provider (Recraft), or null when none is
 *  connected — the built-in AI is never used for images. */
export function imageProviderPayload() {
  const p = getActiveImageProvider();
  if (!p) return null;
  return { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, fallback: false };
}

export function thumbnailProviderPayload() {
  return imageProviderPayload();
}

/** Whether image generation can start. Requires a connected Recraft key —
 *  generation never falls back to the built-in AI. */
export function imageProviderReady(): { ok: boolean; message?: string } {
  return getActiveImageProvider()
    ? { ok: true }
    : { ok: false, message: IMAGE_PROVIDER_NOT_CONNECTED };
}

export function ttsProviderPayload() {
  const p = getActiveProvider();
  const s = getProviderSettings();
  if (!p || s.voice !== "gemini") return undefined;
  return { name: p.name, apiKey: p.apiKey, ttsModel: p.ttsModel, fallback: s.fallback };
}
