// Active AI provider resolution (client side). Images are intentionally routed
// only to a real external image provider. The built-in AI is disabled for image
// generation and must never be used as a silent fallback.
import { readLocal, writeLocal, useLocal } from "./local";
import type { ApiKeyEntry } from "./types";
import { getGeminiImageKeys, useGeminiImageKeys } from "./gemini-image-keys";
import type { GeminiImageKey } from "./gemini-image-keys";

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

export type ImageProviderName = "gemini" | "openai" | "fal" | "replicate" | "recraft" | "puter" | "builtin";

export interface ActiveImageProvider {
  id: string;
  name: ImageProviderName;
  label: string;
  apiKey: string;
  imageModel: string;
  testPassed: boolean;
}

export const IMAGE_PROVIDER_NOT_CONNECTED =
  "No image provider is connected. Add your Google Gemini image key in API Settings.";
export const IMAGE_PROVIDER_TEST_PASSED = "Image provider test passed";

export const GEMINI_UNSUPPORTED_MESSAGE =
  "Gemini does not support this task in the current setup. Please connect another provider.";

// Separate Gemini models per task. The text model must never be used for image
// generation, and the image model must never be used for text.
export const GEMINI_TEXT_MODEL_DEFAULT = "gemini-2.5-flash";
// Current, existing Gemini image model. The old
// "gemini-2.0-flash-preview-image-generation" id no longer exists on v1beta
// (404). The real model is resolved dynamically before every request.
export const GEMINI_IMAGE_MODEL_DEFAULT = "gemini-3.1-flash-image";

// Tasks Gemini can handle in this setup. Kept as a map so the UI and the
// server can agree on what is/ isn't routable to Gemini.
export const GEMINI_SUPPORTS: Record<AiTask, boolean> = {
  text: true,
  image: true,
  tts: true,
};

// ---- Provider routing settings (which provider handles each task) ----
export type ProviderChoice =
  | "gemini"
  | "builtin"
  | "openai"
  | "fal"
  | "replicate"
  | "recraft"
  | "puter"
  | "disabled";

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
  image: "gemini",
  voice: "gemini",
  thumbnail: "gemini",
  // Never silently fall back to the built-in AI. When Gemini is connected we
  // route to Gemini only and surface its real errors. Fallback is opt-in.
  fallback: false,
};

function normalizeSettings(s: Partial<ProviderSettings> | null): ProviderSettings {
  const next = { ...DEFAULT_PROVIDER_SETTINGS, ...(s ?? {}) };
  // Gemini-only mode: OpenAI is disabled as an ACTIVE provider everywhere. It
  // stays selectable in API Settings for future use, but never routes here.
  if (next.text === "openai") next.text = "gemini";
  if (next.voice === "openai") next.voice = "gemini";
  // Image generation must never touch the built-in AI or OpenAI. Any legacy
  // built-in/OpenAI image routing is coerced to Gemini image.
  if (next.image === "builtin" || next.image === "disabled" || next.image === "openai") next.image = "gemini";
  if (next.thumbnail === "builtin" || next.thumbnail === "disabled" || next.thumbnail === "openai") next.thumbnail = "gemini";
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

function findOpenAI(list: ApiKeyEntry[]): ApiKeyEntry | null {
  return list.find((e) => e.provider === "OpenAI" && e.apiKey.trim()) ?? null;
}

// ---- Active TEXT provider (Gemini or OpenAI, per routing settings) ----
export interface ActiveTextProvider {
  name: "gemini" | "openai";
  apiKey: string;
  textModel: string;
}

function resolveTextProvider(settings: ProviderSettings, list: ApiKeyEntry[]): ActiveTextProvider | null {
  if (settings.text === "openai") {
    const o = findOpenAI(list);
    return o
      ? { name: "openai", apiKey: o.apiKey.trim(), textModel: o.modelName?.trim() || "gpt-4o-mini" }
      : null;
  }
  if (settings.text === "gemini") {
    const g = findGemini(list);
    return g
      ? { name: "gemini", apiKey: g.apiKey.trim(), textModel: g.modelName?.trim() || "gemini-2.5-flash" }
      : null;
  }
  return null; // built-in / disabled
}

/** Non-reactive read of the active text provider (Gemini or OpenAI). */
export function getActiveTextProvider(): ActiveTextProvider | null {
  return resolveTextProvider(getProviderSettings(), readLocal<ApiKeyEntry[]>(KEY, []));
}

/** Reactive hook for the active text provider. */
export function useActiveTextProvider(): ActiveTextProvider | null {
  const settings = useProviderSettings();
  const list = useLocal<ApiKeyEntry[]>(KEY, []);
  return resolveTextProvider(settings, list);
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
  if (choice === "gemini") return GEMINI_IMAGE_MODEL_DEFAULT;
  if (choice === "openai") return "gpt-image-1";
  if (choice === "fal") return "fal-ai/flux/schnell";
  if (choice === "replicate") return "black-forest-labs/flux-schnell";
  if (choice === "recraft") return "recraftv4_1_utility_pro";
  if (choice === "puter") return "puter-txt2img";
  return "";
}

function imageLabel(choice: ProviderChoice): string {
  if (choice === "gemini") return "Gemini Image";
  if (choice === "openai") return "OpenAI Images";
  if (choice === "fal") return "Fal.ai";
  if (choice === "replicate") return "Replicate";
  if (choice === "recraft") return "Recraft V4.1 Utility Pro";
  if (choice === "puter") return "Puter AI";
  return "Built-in AI disabled";
}

/** Puter AI needs no API key and runs entirely in the browser, so it resolves
 *  to a synthetic "connected" provider whenever it is the selected choice. */
function puterImageProvider(): ActiveImageProvider {
  return {
    id: "puter",
    name: "puter",
    label: "Puter AI",
    apiKey: "",
    imageModel: "puter-txt2img",
    testPassed: true,
  };
}

/** Resolve a connected Gemini image provider from the dedicated Gemini image
 *  key pool (the "Gemini Image Keys" panel). This is the primary source for
 *  Gemini image generation — no Recraft key is ever required. Prefers a usable
 *  (non-disabled) key, then falls back to any key that has a value. */
function poolToImageProvider(keys: GeminiImageKey[]): ActiveImageProvider | null {
  const usable =
    keys.find((k) => k.status !== "disabled" && k.key.trim()) ??
    keys.find((k) => k.key.trim());
  if (!usable) return null;
  return {
    id: usable.id,
    name: "gemini",
    label: "Gemini Image",
    apiKey: usable.key.trim(),
    imageModel: usable.imageModel?.trim() || GEMINI_IMAGE_MODEL_DEFAULT,
    testPassed: true,
  };
}

/** Resolve the active image provider for a given choice. For Gemini we accept
 *  EITHER a Google Gemini key in the API vault OR a key from the Gemini image
 *  key pool — so image generation never requires Recraft. Recraft (and every
 *  other provider) is only ever consulted when it is the explicitly selected
 *  choice. */
function resolveImageProvider(
  choice: ProviderChoice,
  list: ApiKeyEntry[],
  poolKeys: GeminiImageKey[],
): ActiveImageProvider | null {
  if (choice === "puter") return puterImageProvider();
  const fromVault = toImageProvider(choice, findImageKey(choice, list));
  if (fromVault) return fromVault;
  if (choice === "gemini") return poolToImageProvider(poolKeys);
  return null;
}

function toImageProvider(choice: ProviderChoice, entry: ApiKeyEntry | null): ActiveImageProvider | null {
  // Puter requires no key — it is always available client-side.
  if (choice === "puter") return puterImageProvider();
  if (!entry) return null;
  if (choice !== "gemini" && choice !== "openai" && choice !== "fal" && choice !== "replicate" && choice !== "recraft")
    return null;

  // For Gemini image, prefer the dedicated image model the user picked via the
  // "List Available Gemini Models" diagnostic (stored separately from the text
  // modelName). Never use the text modelName (e.g. gemini-2.5-flash) for images.
  let imageModel = entry.modelName?.trim() || "";
  if (choice === "gemini") {
    const picked = entry.imageModelName?.trim() || "";
    imageModel = picked.toLowerCase().includes("image")
      ? picked
      : imageModel.toLowerCase().includes("image")
        ? imageModel
        : GEMINI_IMAGE_MODEL_DEFAULT;
  } else if (choice === "recraft") {
    // Force a Recraft image model. Ignore any label a user might have typed.
    imageModel = imageModel.toLowerCase().startsWith("recraft") ? imageModel : "recraftv4_1_utility_pro";
  } else if (choice === "openai") {
    // Force an OpenAI image model. A text model (e.g. gpt-4o-mini) must never
    // be used for image generation — default to gpt-image-1.
    imageModel = imageModel.toLowerCase().includes("image") ? imageModel : "gpt-image-1";
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
    textModel: e.modelName?.trim() || GEMINI_TEXT_MODEL_DEFAULT,
    imageModel: GEMINI_IMAGE_MODEL_DEFAULT,
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
  return resolveImageProvider(choice, readLocal<ApiKeyEntry[]>(KEY, []), getGeminiImageKeys());
}

export function useActiveImageProvider(): ActiveImageProvider | null {
  const settings = useProviderSettings();
  const list = useLocal<ApiKeyEntry[]>(KEY, []);
  const pool = useGeminiImageKeys();
  return resolveImageProvider(settings.image, list, pool);
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
  const pool = useGeminiImageKeys();
  return statusFor(settings.image, resolveImageProvider(settings.image, list, pool));
}

/** Image generation status for the SELECTED provider. The built-in AI is never
 *  used for images. Messages are provider-specific — Recraft is only ever named
 *  when Recraft is the selected choice. */
function statusFor(choice: ProviderChoice, external: ActiveImageProvider | null) {
  if (external) {
    return {
      choice,
      label: external.label,
      connected: true,
      testPassed: external.testPassed,
      ok: true,
      message: "Connected",
    };
  }
  if (choice === "puter") {
    return {
      choice,
      label: "Puter AI",
      connected: true,
      testPassed: true,
      ok: true,
      message: "Ready (no API key required)",
    };
  }
  return {
    choice,
    label: imageLabel(choice),
    connected: false,
    testPassed: false,
    ok: false,
    message: notConnectedMessage(choice),
  };
}

/** Provider-specific "not connected" copy. Never mentions Recraft unless
 *  Recraft is the selected image provider. */
function notConnectedMessage(choice: ProviderChoice): string {
  switch (choice) {
    case "gemini":
      return "Google Gemini is not connected. Add a Gemini image key in API Settings.";
    case "recraft":
      return "Recraft is not connected. Add your Recraft API key in API Settings and test the connection.";
    case "fal":
      return "Fal.ai is not connected. Add your Fal.ai API key in API Settings.";
    case "replicate":
      return "Replicate is not connected. Add your Replicate API key in API Settings.";
    case "openai":
      return "OpenAI Images is not connected. Add your OpenAI API key in API Settings.";
    default:
      return IMAGE_PROVIDER_NOT_CONNECTED;
  }
}

/** Body payload passed to the image API route so the server can route. Returns
 *  the connected external image provider (Recraft), or null when none is
 *  connected — the built-in AI is never used for images. */
export function imageProviderPayload() {
  const p = getActiveImageProvider();
  if (!p) return null;
  return { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, fallback: false };
}

/** First connected non-Puter image provider (Gemini or Recraft), used as an
 *  automatic fallback when Puter AI is unavailable or rate limited. */
export function fallbackImageProviderPayload() {
  const list = readLocal<ApiKeyEntry[]>(KEY, []);
  const pool = getGeminiImageKeys();
  for (const choice of ["gemini", "recraft"] as ProviderChoice[]) {
    const p = resolveImageProvider(choice, list, pool);
    if (p) return { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, fallback: false };
  }
  return null;
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
