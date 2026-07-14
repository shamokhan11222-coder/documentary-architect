// Dynamic Gemini text-model resolver. Calls the Google ListModels endpoint
// and picks the first ACTIVE model that supports `generateContent`, in
// priority order. Results are cached per API key so we don't hit the
// models list on every request.

interface GoogleModel {
  name: string; // "models/gemini-2.5-flash"
  supportedGenerationMethods?: string[];
  state?: string; // sometimes present
}

interface Cached {
  model: string;
  at: number;
  models: GoogleModel[];
  status: number;
}

const cache = new Map<string, Cached>();
const TTL_MS = 10 * 60 * 1000; // 10 min

const PRIORITY = [
  /^models\/gemini-3\.1-flash$/i,
  /^models\/gemini-3-flash/i,
  /^models\/gemini-2\.5-flash$/i,
  /^models\/gemini-2\.5-flash-/i,
  /^models\/gemini-.*-flash$/i,
  /^models\/gemini-.*flash.*$/i,
];

export interface GeminiModelPick {
  model: string;
  endpoint: string;
  listStatus: number;
  listOk: boolean;
  listedCount: number;
  candidates: string[];
  rawError?: string;
}

export async function listGeminiModels(
  apiKey: string,
  opts: { force?: boolean } = {},
): Promise<{ status: number; models: GoogleModel[]; rawError?: string }> {
  const hit = cache.get(apiKey);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) {
    return { status: hit.status, models: hit.models };
  }
  const url = "https://generativelanguage.googleapis.com/v1beta/models";
  const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
  const status = res.status;
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    return { status, models: [], rawError: raw.slice(0, 4000) };
  }
  const data = (await res.json()) as { models?: GoogleModel[] };
  const models = data.models ?? [];
  return { status, models };
}

function normalizeName(n: string): string {
  return n.startsWith("models/") ? n : `models/${n}`;
}

function pickFrom(models: GoogleModel[]): { model: string; candidates: string[] } {
  const eligible = models.filter((m) =>
    (m.supportedGenerationMethods ?? []).includes("generateContent"),
  );
  const names = eligible.map((m) => normalizeName(m.name));
  for (const pattern of PRIORITY) {
    const hit = names.find((n) => pattern.test(n));
    if (hit) return { model: hit, candidates: names };
  }
  // Fall back to any generateContent model (prefer non-preview/non-vision).
  const generic =
    names.find((n) => /gemini/i.test(n) && !/vision|image|tts|audio/i.test(n)) ||
    names[0] ||
    "";
  return { model: generic, candidates: names };
}

export async function pickGeminiTextModel(
  apiKey: string,
  opts: { force?: boolean } = {},
): Promise<GeminiModelPick> {
  const list = await listGeminiModels(apiKey, opts);
  const { model, candidates } = pickFrom(list.models);
  if (list.status === 200 && model) {
    cache.set(apiKey, { model, at: Date.now(), models: list.models, status: list.status });
  }
  return {
    model,
    endpoint: model
      ? `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`
      : "",
    listStatus: list.status,
    listOk: list.status === 200,
    listedCount: list.models.length,
    candidates,
    rawError: list.rawError,
  };
}

export function invalidateGeminiModelCache(apiKey: string) {
  cache.delete(apiKey);
}

export function getCachedGeminiModel(apiKey: string): string | null {
  const hit = cache.get(apiKey);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) return null;
  return hit.model;
}
