// API Settings — active provider vault. Keys are stored locally in the browser
// and used to activate Google Gemini as the live provider for supported tasks.
import { readLocal, writeLocal, useLocal } from "./local";
import type { ApiKeyEntry, ApiProvider } from "./types";
import { GEMINI_FORCED_IMAGE_MODEL, GEMINI_TEXT_MODEL_DEFAULT_FULL, normalizeGeminiModel } from "./gemini-model";

const KEY = "docos.apikeys";

export const API_PROVIDERS: ApiProvider[] = [
  "OpenAI",
  "Google Gemini",
  "Fal.ai",
  "Replicate",
  "Recraft",
  "ElevenLabs",
  "Custom Provider",
];

export function useApiKeys(): ApiKeyEntry[] {
  return reconcileGeminiModels(useLocal<ApiKeyEntry[]>(KEY, []));
}

export function saveApiKey(entry: Omit<ApiKeyEntry, "id" | "at"> & { id?: string }) {
  const list = reconcileGeminiModels(readLocal<ApiKeyEntry[]>(KEY, []));
  const cleanedEntry = cleanGeminiEntry(entry);
  if (entry.id) {
    writeLocal(
      KEY,
      list.map((e) => (e.id === entry.id ? { ...e, ...cleanedEntry, id: e.id } : e)),
    );
    return;
  }
  const created: ApiKeyEntry = {
    ...cleanedEntry,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  writeLocal(KEY, [created, ...list]);
}

export function deleteApiKey(id: string) {
  writeLocal(KEY, reconcileGeminiModels(readLocal<ApiKeyEntry[]>(KEY, [])).filter((e) => e.id !== id));
}

export function markTested(id: string, result: string) {
  writeLocal(
    KEY,
    readLocal<ApiKeyEntry[]>(KEY, []).map((e) =>
      e.id === id ? { ...cleanGeminiEntry(e), lastTested: Date.now(), testResult: result } : cleanGeminiEntry(e),
    ),
  );
}

function cleanGeminiEntry<T extends Partial<ApiKeyEntry>>(entry: T): T {
  if (entry.provider !== "Google Gemini") return entry;
  return {
    ...entry,
    modelName: normalizeGeminiModel(entry.modelName) || GEMINI_TEXT_MODEL_DEFAULT_FULL,
    imageModelName: GEMINI_FORCED_IMAGE_MODEL,
  };
}

function reconcileGeminiModels(list: ApiKeyEntry[]): ApiKeyEntry[] {
  let changed = false;
  const next = list.map((entry) => {
    const cleaned = cleanGeminiEntry(entry);
    if (cleaned !== entry && JSON.stringify(cleaned) !== JSON.stringify(entry)) changed = true;
    return cleaned as ApiKeyEntry;
  });
  if (changed) writeLocal(KEY, next);
  return next;
}
