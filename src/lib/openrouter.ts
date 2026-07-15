// Client-side OpenRouter preferences: primary + fallback model ids saved in
// localStorage and attached to every server-function call as request headers
// by the middleware in src/start.ts. The OPENROUTER_API_KEY itself is a
// server-only secret and is never stored in the browser.
import { readLocal, writeLocal, useLocal } from "./local";
import { OPENROUTER_DEFAULT_MODELS } from "./openrouter.server";

export interface OpenRouterSettings {
  primary: string;
  fallback: string;
}

const KEY = "docos.openrouter.settings";

export const DEFAULT_OPENROUTER_SETTINGS: OpenRouterSettings = {
  primary: OPENROUTER_DEFAULT_MODELS[0],
  fallback: OPENROUTER_DEFAULT_MODELS[1],
};

function normalize(s: Partial<OpenRouterSettings> | null): OpenRouterSettings {
  return {
    primary: (s?.primary ?? "").trim() || DEFAULT_OPENROUTER_SETTINGS.primary,
    fallback: (s?.fallback ?? "").trim() || DEFAULT_OPENROUTER_SETTINGS.fallback,
  };
}

export function getOpenRouterSettings(): OpenRouterSettings {
  return normalize(readLocal<Partial<OpenRouterSettings>>(KEY, {}));
}

export function useOpenRouterSettings(): OpenRouterSettings {
  return normalize(useLocal<Partial<OpenRouterSettings>>(KEY, {}));
}

export function saveOpenRouterSettings(patch: Partial<OpenRouterSettings>) {
  writeLocal(KEY, normalize({ ...getOpenRouterSettings(), ...patch }));
}

/** Reset model selection to the built-in defaults. Does NOT delete the
 *  server-side OPENROUTER_API_KEY (that is managed at the workspace level). */
export function resetOpenRouterSettings() {
  writeLocal(KEY, DEFAULT_OPENROUTER_SETTINGS);
}

/** Free preset labels shown as a starter option in the model picker. */
export const OPENROUTER_FREE_PRESETS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 0324 (free)" },
  { id: "qwen/qwen3-32b:free", label: "Qwen3 32B (free)" },
  { id: "mistralai/mistral-small-3.2-24b-instruct:free", label: "Mistral Small 3.2 24B (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { id: "google/gemma-2-9b-it:free", label: "Gemma 2 9B (free)" },
];