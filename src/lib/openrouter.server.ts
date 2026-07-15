// OpenRouter text provider. Server-only. Used for ALL text-generation tasks
// when OPENROUTER_API_KEY is set — bypassing the Lovable AI Gateway, Gemini,
// and Groq. Image and voice pipelines are unaffected.
import { makeProviderError } from "./provider-error";
import { getRequestHeader } from "@tanstack/react-start/server";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

// Sentinels understood by the router (not real model IDs).
export const OR_SENTINEL_AUTO = "auto";
export const OR_SENTINEL_FREE_ROUTER = "openrouter/free";

// Built-in preference order for free instruct models when picking automatically.
// Slugs are matched by substring against live model IDs — no hardcoded ":free"
// version numbers, which go stale as OpenRouter rotates free offerings.
const FREE_PREFERENCE_PATTERNS: RegExp[] = [
  /qwen.*(instruct|chat)/i,
  /deepseek.*(chat|instruct)/i,
  /mistral.*(instruct)/i,
  /(llama|meta-llama).*(instruct)/i,
  /gemma.*(it|instruct)/i,
  /./i, // any remaining free model
];

// Kept for API compatibility with older imports. The runtime chain is now
// dynamic — see resolveModelChain(). This list is used ONLY as a starter
// fallback if the live models endpoint is unreachable and must never include
// stale slugs like "mistralai/mistral-small-3.2-24b-instruct:free".
export const OPENROUTER_DEFAULT_MODELS = [
  OR_SENTINEL_FREE_ROUTER,
  "deepseek/deepseek-chat-v3-0324:free",
  "qwen/qwen3-32b:free",
] as const;

// --- Free-model catalog cache (15 minutes) ----------------------------------

export interface FreeModelInfo {
  id: string;
  name: string;
  contextLength: number | null;
}

interface CacheEntry {
  at: number;
  models: FreeModelInfo[];
}

const CACHE_TTL_MS = 15 * 60 * 1000;
let freeModelsCache: CacheEntry | null = null;

// Temporary per-model blacklist for models that returned 404 unavailable /
// 429 rate-limited / provider-unavailable. Cleared after 5 minutes so
// transient outages recover automatically.
const BLACKLIST_TTL_MS = 5 * 60 * 1000;
const modelBlacklist = new Map<string, number>();

function isBlacklisted(id: string): boolean {
  const expiry = modelBlacklist.get(id);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelBlacklist.delete(id);
    return false;
  }
  return true;
}

function blacklist(id: string) {
  modelBlacklist.set(id, Date.now() + BLACKLIST_TTL_MS);
}

async function fetchFreeModelsFromApi(apiKey: string): Promise<FreeModelInfo[]> {
  const res = await fetch(OPENROUTER_MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { modality?: string; input_modalities?: string[] };
    }>;
  } | null;
  const list = data?.data ?? [];
  const free = list.filter((m) => {
    const p = Number(m.pricing?.prompt ?? "0");
    const c = Number(m.pricing?.completion ?? "0");
    if (!(p === 0 && c === 0)) return false;
    // Reject models that aren't text/chat capable.
    const mod = (m.architecture?.modality ?? "").toLowerCase();
    if (mod && !mod.includes("text")) return false;
    return true;
  });
  return free.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    contextLength: m.context_length ?? null,
  }));
}

export async function getFreeModelsCached(apiKey: string): Promise<FreeModelInfo[]> {
  const now = Date.now();
  if (freeModelsCache && now - freeModelsCache.at < CACHE_TTL_MS) {
    return freeModelsCache.models;
  }
  const models = await fetchFreeModelsFromApi(apiKey);
  if (models.length > 0) freeModelsCache = { at: now, models };
  return freeModelsCache?.models ?? [];
}

/** Return free model IDs ordered by preference patterns. */
function orderFreeModels(free: FreeModelInfo[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pat of FREE_PREFERENCE_PATTERNS) {
    for (const m of free) {
      if (seen.has(m.id)) continue;
      if (pat.test(m.id)) {
        out.push(m.id);
        seen.add(m.id);
      }
    }
  }
  return out;
}

/** Build the runtime candidate chain.
 *  Order:
 *    A. openrouter/free (if selected or Auto)
 *    B. selected primary/fallback (only if currently free)
 *    C. remaining live free models by preference
 *  Blacklisted models are removed. */
async function resolveModelChain(apiKey: string): Promise<string[]> {
  let primary = "";
  let fallback = "";
  try {
    primary = (getRequestHeader("x-openrouter-primary") ?? "").trim();
    fallback = (getRequestHeader("x-openrouter-fallback") ?? "").trim();
  } catch {
    /* outside request context */
  }

  const free = await getFreeModelsCached(apiKey);
  const freeIds = new Set(free.map((m) => m.id));
  const ordered = orderFreeModels(free);

  const chain: string[] = [];
  const push = (id: string) => {
    if (!id) return;
    if (chain.includes(id)) return;
    if (isBlacklisted(id)) return;
    chain.push(id);
  };

  const wantsAuto =
    !primary || primary === OR_SENTINEL_AUTO || primary === OR_SENTINEL_FREE_ROUTER;

  // A. Free Router first when Auto or explicitly selected.
  if (wantsAuto || fallback === OR_SENTINEL_FREE_ROUTER) {
    push(OR_SENTINEL_FREE_ROUTER);
  }

  // B. User selections, but ONLY if currently free.
  for (const sel of [primary, fallback]) {
    if (!sel || sel === OR_SENTINEL_AUTO || sel === OR_SENTINEL_FREE_ROUTER) continue;
    if (freeIds.has(sel)) push(sel);
    // If not in freeIds, we silently skip — spec: never call a paid model.
  }

  // C. Rest of the live free catalog, in preference order.
  for (const id of ordered) push(id);

  return chain;
}

export function openrouterEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function isFallbackWorthy(status: number, body: string): boolean {
  if (status === 404 || status === 400 || status === 402 || status === 429) return true;
  if (status >= 500) return true;
  const b = body.toLowerCase();
  return (
    b.includes("quota") ||
    b.includes("unavailable") ||
    b.includes("rate limit") ||
    b.includes("no allowed providers") ||
    b.includes("paid version") ||
    b.includes("not available for free")
  );
}

type CallResult =
  | { ok: true; content: string; model: string; status: number; ms: number; requestId: string | null }
  | { ok: false; status: number; body: string; ms: number; requestId: string | null; retryAfter: string | null; model: string };

export async function openrouterCallOnce(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  json: boolean,
): Promise<CallResult> {
  const startedAt = Date.now();
  const doFetch = async (useJsonMode: boolean) => {
    const sys = json
      ? `${system}\n\nReturn valid JSON only. Do not use markdown. Do not use code fences. Do not add explanations before or after the JSON.`
      : system;
    return fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://stickmax.studio",
        "X-Title": "Stickmax Studio",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        ...(json && useJsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  };
  let res = await doFetch(true);
  // Some free models don't support response_format=json_object and reject with
  // 400/404. Retry once without json mode, keeping the strict JSON instruction.
  if (json && !res.ok && (res.status === 400 || res.status === 404)) {
    const peek = await res.clone().text().catch(() => "");
    if (/response_format|json_object|json mode|not support/i.test(peek)) {
      res = await doFetch(false);
    }
  }
  const ms = Date.now() - startedAt;
  const requestId = res.headers.get("x-request-id");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body, ms, requestId, retryAfter: res.headers.get("retry-after"), model };
  }
  const data = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } } | null;
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content && data?.error?.message) {
    return { ok: false, status: res.status, body: JSON.stringify(data), ms, requestId, retryAfter: null, model };
  }
  return { ok: true, content, model, status: res.status, ms, requestId };
}

function extractOrMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    return j?.error?.message || j?.message || "";
  } catch {
    return "";
  }
}

/** Walks the free-model chain, falling back on 429/quota/unavailable. */
export async function openrouterGenerate(
  system: string,
  user: string,
  json: boolean,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const chain = await resolveModelChain(apiKey);
  if (chain.length === 0) {
    throw makeProviderError({
      provider: "openrouter",
      model: "",
      endpoint: OPENROUTER_ENDPOINT,
      httpStatus: 503,
      requestId: null,
      responseTimeMs: null,
      retryAfter: null,
      message: "No free OpenRouter model is currently available. Try again later.",
      rawBody: "",
    });
  }
  let last: CallResult | null = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    console.log("[openrouter] POST %s model=%s json=%s", OPENROUTER_ENDPOINT, model, json);
    const attempt = await openrouterCallOnce(apiKey, model, system, user, json);
    if (attempt.ok) {
      console.log("[openrouter] response model=%s status=%d %dms (%d chars)",
        attempt.model, attempt.status, attempt.ms, attempt.content.length);
      return attempt.content;
    }
    console.warn("[openrouter] model=%s failed status=%d body=%s", model, attempt.status, attempt.body.slice(0, 200));
    // Temporarily blacklist models that are unavailable / rate-limited so we
    // stop hitting them for the next 5 minutes.
    if (attempt.status === 404 || attempt.status === 429 || attempt.status >= 500) {
      blacklist(model);
    } else {
      const b = attempt.body.toLowerCase();
      if (b.includes("paid version") || b.includes("not available for free") || b.includes("unavailable")) {
        blacklist(model);
      }
    }
    last = attempt;
    if (!isFallbackWorthy(attempt.status, attempt.body)) break;
  }

  const a = last!;
  const msg = extractOrMessage(a.body) || `OpenRouter request failed (${a.status})`;
  throw makeProviderError({
    provider: "openrouter",
    model: a.model,
    endpoint: OPENROUTER_ENDPOINT,
    httpStatus: a.status,
    requestId: a.requestId,
    responseTimeMs: a.ms,
    retryAfter: a.retryAfter,
    message: msg,
    rawBody: a.body.slice(0, 20000),
  });
}