// Active AI provider resolution (client side). Reads the keys saved in
// API Settings (localStorage) and, when a Google Gemini key is present,
// makes Gemini the active provider for every supported task. When no Gemini
// key is saved the app falls back to the built-in Lovable AI.
import { readLocal, useLocal } from "./local";
import type { ApiKeyEntry } from "./types";

const KEY = "docos.apikeys";

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
export function providerPayload() {
  const p = getActiveProvider();
  if (!p) return undefined;
  return { name: p.name, apiKey: p.apiKey, imageModel: p.imageModel, ttsModel: p.ttsModel };
}
