// Active AI provider resolution (client side). Zero-Budget Mode forces every
// image and thumbnail request through Puter AI with Pollinations as fallback.
// Gemini / OpenAI / Recraft stay in API Settings only as disabled future image
// providers and must never become an active image route.
import { readLocal, writeLocal, useLocal } from "./local";
import type { ApiKeyEntry } from "./types";
import {
  GEMINI_TEXT_MODEL_DEFAULT_FULL,
  GEMINI_TTS_MODEL_DEFAULT_FULL,
  normalizeGeminiModel,
} from "./gemini-model";

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

export type ImageProviderName =
  | "gemini"
  | "openai"
  | "fal"
  | "replicate"
  | "recraft"
  | "puter"
  | "huggingface"
  | "pollinations"
  | "builtin";

export interface ActiveImageProvider {
  id: string;
  name: ImageProviderName;
  label: string;
  apiKey: string;
  imageModel: string;
  testPassed: boolean;
}

export const IMAGE_PROVIDER_NOT_CONNECTED =
  "Zero-Budget image mode is ready: Puter AI primary, Pollinations fallback.";
export const IMAGE_PROVIDER_TEST_PASSED = "Image provider test passed";
export const GEMINI_IMAGE_DISABLED_MESSAGE = "BUG: Gemini image provider is disabled in Zero-Budget Mode.";

export const GEMINI_UNSUPPORTED_MESSAGE =
  "Gemini does not support this task in the current setup. Please connect another provider.";

// Separate Gemini models per task. The text model must never be used for image
// generation, and the image model must never be used for text.
export const GEMINI_TEXT_MODEL_DEFAULT = GEMINI_TEXT_MODEL_DEFAULT_FULL;
export const GEMINI_IMAGE_MODEL_DEFAULT = "disabled-zero-budget-mode";

// Tasks Gemini can handle in this setup. Kept as a map so the UI and the
// server can agree on what is/ isn't routable to Gemini.
export const GEMINI_SUPPORTS: Record<AiTask, boolean> = {
  text: true,
  image: false,
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
  | "huggingface"
  | "pollinations"
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
  // SPLIT PROVIDER RECOVERY: Lovable AI Gateway balance is exhausted. Text
  // modules route directly to the user's BYOK Google Gemini key. Image stays
  // on the zero-budget Puter/Pollinations pipeline (independent of text).
  text: "gemini",
  image: "puter",
  voice: "builtin",
  thumbnail: "puter",
  // Never silently fall back to the built-in AI. When Gemini is connected we
  // route to Gemini only and surface its real errors. Fallback is opt-in.
  fallback: false,
};

function normalizeSettings(s: Partial<ProviderSettings> | null): ProviderSettings {
  const next = { ...DEFAULT_PROVIDER_SETTINGS, ...(s ?? {}) };
  // SPLIT PROVIDER RECOVERY: text is locked to BYOK Gemini (Gateway balance
  // is zero). Any stale "builtin" / "openai" saved choice is coerced to
  // "gemini" on read so no text call hits ai.gateway.lovable.dev.
  next.text = "gemini";
  // Voice keeps its saved value; the resolver decides whether it works.
  // Zero-budget image pipeline: only Puter (primary) and Pollinations
  // (fallback) are active image providers. Gemini / OpenAI / Recraft and the
  // built-in AI remain selectable in API Settings ONLY as disabled future
  // providers and must never route here, so any other choice coerces to Puter.
  next.image = "puter";
  next.thumbnail = "puter";
  return next;
}

function sanitizeProviderSettingsForStorage(s: Partial<ProviderSettings> | null): ProviderSettings {
  return normalizeSettings(s);
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
  writeLocal(SETTINGS_KEY, sanitizeProviderSettingsForStorage({ ...getProviderSettings(), ...next }));
}

/** Clears stale active image-provider settings without deleting keys, projects,
 *  scenes, thumbnails, or generated image data. Called on image/settings pages so
 *  old saved Gemini/OpenAI/Recraft routes cannot linger in React/localStorage. */
export function enforceZeroBudgetImageRouting() {
  writeLocal(SETTINGS_KEY, sanitizeProviderSettingsForStorage(readLocal<Partial<ProviderSettings>>(SETTINGS_KEY, {})));
}

function findGemini(list: ApiKeyEntry[]): ApiKeyEntry | null {
  return list.find((e) => e.provider === "Google Gemini" && e.apiKey.trim()) ?? null;
}

function resetSavedGeminiModelLabels(list: ApiKeyEntry[]): ApiKeyEntry[] {
  let changed = false;
  const next = list.map((entry) => {
    if (entry.provider !== "Google Gemini") return entry;
    const cleaned = {
      ...entry,
      modelName: normalizedGeminiTextModel(entry.modelName),
      imageModelName: normalizeGeminiModel(entry.imageModelName),
    };
    if (cleaned.modelName !== entry.modelName || cleaned.imageModelName !== entry.imageModelName) changed = true;
    return cleaned;
  });
  if (changed) writeLocal(KEY, next);
  return next;
}

function normalizedGeminiTextModel(raw?: string): string {
  return normalizeGeminiModel(raw) || GEMINI_TEXT_MODEL_DEFAULT;
}

function finalGeminiImageModel(): string {
  return GEMINI_IMAGE_MODEL_DEFAULT;
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
      ? { name: "gemini", apiKey: g.apiKey.trim(), textModel: normalizedGeminiTextModel(g.modelName) }
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
              : choice === "huggingface"
                ? "HuggingFace"
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
  if (choice === "huggingface") return "black-forest-labs/FLUX.1-schnell";
  if (choice === "pollinations") return "flux";
  if (choice === "builtin") return "";
  return "";
}

function imageLabel(choice: ProviderChoice): string {
  if (choice === "gemini") return "Gemini Image";
  if (choice === "openai") return "OpenAI Images";
  if (choice === "fal") return "Fal.ai";
  if (choice === "replicate") return "Replicate";
  if (choice === "recraft") return "Recraft V4.1 Utility Pro";
  if (choice === "puter") return "Puter AI";
  if (choice === "huggingface") return "HuggingFace";
  if (choice === "pollinations") return "Pollinations";
  if (choice === "builtin") return "Gemini Image";
  return "Gemini Image";
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

/** Pollinations needs no API key — resolves to a synthetic connected provider. */
function pollinationsImageProvider(): ActiveImageProvider {
  return {
    id: "pollinations",
    name: "pollinations",
    label: "Pollinations",
    apiKey: "",
    imageModel: "flux",
    testPassed: true,
  };
}

function resolveImageProvider(choice: ProviderChoice): ActiveImageProvider {
  return choice === "pollinations" ? pollinationsImageProvider() : puterImageProvider();
}

function toImageProvider(choice: ProviderChoice, entry: ApiKeyEntry | null): ActiveImageProvider | null {
  // Puter requires no key — it is always available client-side.
  if (choice === "puter") return puterImageProvider();
  if (choice === "pollinations") return pollinationsImageProvider();
  if (!entry) return null;
  if (
    choice !== "gemini" &&
    choice !== "openai" &&
    choice !== "fal" &&
    choice !== "replicate" &&
    choice !== "recraft" &&
    choice !== "huggingface"
  )
    return null;

  // For Gemini image, prefer the dedicated image model the user picked via the
  // "List Available Gemini Models" diagnostic (stored separately from the text
  // modelName). Never use the text modelName (e.g. gemini-2.5-flash) for images.
  let imageModel = entry.imageModelName?.trim() || entry.modelName?.trim() || "";
  if (choice === "gemini") {
    throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
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
    textModel: normalizedGeminiTextModel(e.modelName),
    imageModel: finalGeminiImageModel(),
    ttsModel: GEMINI_TTS_MODEL_DEFAULT_FULL,
  };
}

/** Non-reactive read — safe in event handlers, fetch helpers and middleware. */
export function getActiveProvider(): ActiveProvider | null {
  return toProvider(findGemini(resetSavedGeminiModelLabels(readLocal<ApiKeyEntry[]>(KEY, []))));
}

/** Reactive hook for UI. */
export function useActiveProvider(): ActiveProvider | null {
  const list = resetSavedGeminiModelLabels(useLocal<ApiKeyEntry[]>(KEY, []));
  return toProvider(findGemini(list));
}

/** External image provider if the selected image choice has a connected key. */
export function getActiveImageProvider(): ActiveImageProvider | null {
  return resolveImageProvider(getProviderSettings().image);
}

export function useActiveImageProvider(): ActiveImageProvider | null {
  const settings = useProviderSettings();
  return resolveImageProvider(settings.image);
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
  return statusFor(settings.image, resolveImageProvider(settings.image));
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

/** Body payload passed to the image API route so the server can route. */
export function imageProviderPayload() {
  const p = getActiveImageProvider();
  if (p?.name === "gemini") throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
  return p ? { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, fallback: getProviderSettings().fallback } : null;
}

/** Ordered image fallback chain. Built-in AI is intentionally excluded because
 *  it spends Lovable AI balance and returns 402 when that separate pool is empty. */
export function imageFallbackChain(): Array<{
  name: ImageProviderName;
  apiKey: string;
  imageModel: string;
  fallback: boolean;
}> {
  return [];
}

/** First connected fallback provider after the currently active one. Kept for
 *  compatibility with existing callers. */
export function fallbackImageProviderPayload() {
  return imageFallbackChain()[0] ?? null;
}

export function thumbnailProviderPayload() {
  const settings = getProviderSettings();
  const p = resolveImageProvider(settings.thumbnail);
  if (p?.name === "gemini") throw new Error(GEMINI_IMAGE_DISABLED_MESSAGE);
  return p ? { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, fallback: settings.fallback } : null;
}

/** Image generation requires a real connected provider; no paid built-in fallback. */
export function imageProviderReady(): { ok: boolean; message?: string } {
  const status = getImageProviderStatus();
  return status.ok ? { ok: true } : { ok: false, message: status.message };
}

export function ttsProviderPayload() {
  // EMERGENCY RECOVERY: voice routes exclusively through the Lovable AI
  // Gateway TTS endpoint. Never expose a BYOK Gemini TTS payload.
  return undefined;
}
