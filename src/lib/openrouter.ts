// Client-side OpenRouter preferences: primary + fallback model ids saved in
// localStorage and attached to every server-function call as request headers
// by the middleware in src/start.ts. The OPENROUTER_API_KEY itself is a
// server-only secret and is never stored in the browser.
import { readLocal, writeLocal, useLocal } from "./local";

// Sentinels understood by the server router (mirror openrouter.server.ts).
export const OR_AUTO = "auto";
export const OR_FREE_ROUTER = "openrouter/free";

// Client-safe defaults. No hardcoded stale ":free" slugs — the server fetches
// the live free-model catalog on every request and routes dynamically.
export const OPENROUTER_DEFAULT_MODELS = [OR_AUTO, OR_FREE_ROUTER] as const;

export interface OpenRouterSettings {
  primary: string;
  fallback: string;
}

const KEY = "docos.openrouter.settings";

export const DEFAULT_OPENROUTER_SETTINGS: OpenRouterSettings = {
  primary: OR_AUTO,
  fallback: OR_FREE_ROUTER,
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

/** Preset options shown in the model picker. Live free models fetched from
 *  the OpenRouter API are merged in on top of these. Stale outdated slugs
 *  such as `mistralai/mistral-small-3.2-24b-instruct:free` are intentionally
 *  omitted — the server catalog is the source of truth. */
export const OPENROUTER_FREE_PRESETS: ReadonlyArray<{ id: string; label: string }> = [
  { id: OR_AUTO, label: "Auto — Free Models" },
  { id: OR_FREE_ROUTER, label: "OpenRouter Free Router" },
];