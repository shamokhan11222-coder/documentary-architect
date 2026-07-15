// OpenRouter text provider. Server-only. Used for ALL text-generation tasks
// when OPENROUTER_API_KEY is set — bypassing the Lovable AI Gateway, Gemini,
// and Groq. Image and voice pipelines are unaffected.
import { makeProviderError } from "./provider-error";
import { getRequestHeader } from "@tanstack/react-start/server";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Default free-tier chain. The client can override the primary/fallback via
// `x-openrouter-primary` / `x-openrouter-fallback` request headers (set in
// src/start.ts from the API Settings UI). The final entry stays as a
// last-resort free fallback so a stale saved model can never hard-fail a call.
export const OPENROUTER_DEFAULT_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "qwen/qwen3-32b:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
] as const;

/** Resolve the current preferred model chain: user primary → user fallback →
 *  built-in free defaults. Duplicates are removed while preserving order. */
function resolveModelChain(): string[] {
  let primary = "";
  let fallback = "";
  try {
    primary = (getRequestHeader("x-openrouter-primary") ?? "").trim();
    fallback = (getRequestHeader("x-openrouter-fallback") ?? "").trim();
  } catch {
    // outside a request context (e.g. warmup); fall through to defaults
  }
  const chain = [primary, fallback, ...OPENROUTER_DEFAULT_MODELS].filter(Boolean);
  return Array.from(new Set(chain));
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
    b.includes("no allowed providers")
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
  const res = await fetch(OPENROUTER_ENDPOINT, {
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
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
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

  const chain = resolveModelChain();
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