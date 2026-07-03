// Active AI provider resolution (client side). Reads the keys saved in
// API Settings (localStorage) and, when a Google Gemini key is present,
// makes Gemini the active provider for every supported task. When no Gemini
// key is saved the app falls back to the built-in Lovable AI.
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
export type ProviderChoice = "gemini" | "builtin";

export interface ProviderSettings {
  text: ProviderChoice;
  image: ProviderChoice;
  voice: ProviderChoice;
  /** Fall back to built-in Lovable AI if the external provider fails. */
  fallback: boolean;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  text: "gemini",
  image: "gemini",
  voice: "gemini",
  // Never silently fall back to the built-in AI. When Gemini is connected we
  // route to Gemini only and surface its real errors. Fallback is opt-in.
  fallback: false,
};

function normalizeSettings(s: Partial<ProviderSettings> | null): ProviderSettings {
  return { ...DEFAULT_PROVIDER_SETTINGS, ...(s ?? {}) };
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

/** Body payload passed to the image / tts API routes so the server can route. */
export function imageProviderPayload() {
  const p = getActiveProvider();
  const s = getProviderSettings();
  if (!p || s.image !== "gemini") return undefined;
  return { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, fallback: s.fallback };
}

export function ttsProviderPayload() {
  const p = getActiveProvider();
  const s = getProviderSettings();
  if (!p || s.voice !== "gemini") return undefined;
  return { name: p.name, apiKey: p.apiKey, ttsModel: p.ttsModel, fallback: s.fallback };
}
