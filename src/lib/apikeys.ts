// API Settings — active provider vault. Keys are stored locally in the browser
// and used to activate Google Gemini as the live provider for supported tasks.
import { readLocal, writeLocal, useLocal } from "./local";
import type { ApiKeyEntry, ApiProvider } from "./types";

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
  return useLocal<ApiKeyEntry[]>(KEY, []);
}

export function saveApiKey(entry: Omit<ApiKeyEntry, "id" | "at"> & { id?: string }) {
  const list = readLocal<ApiKeyEntry[]>(KEY, []);
  if (entry.id) {
    writeLocal(
      KEY,
      list.map((e) => (e.id === entry.id ? { ...e, ...entry, id: e.id } : e)),
    );
    return;
  }
  const created: ApiKeyEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  writeLocal(KEY, [created, ...list]);
}

export function deleteApiKey(id: string) {
  writeLocal(KEY, readLocal<ApiKeyEntry[]>(KEY, []).filter((e) => e.id !== id));
}

export function markTested(id: string, result: string) {
  writeLocal(
    KEY,
    readLocal<ApiKeyEntry[]>(KEY, []).map((e) =>
      e.id === id ? { ...e, lastTested: Date.now(), testResult: result } : e,
    ),
  );
}
