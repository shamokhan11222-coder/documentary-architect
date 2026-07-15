// Groq text provider. Server-only. Used for ALL text-generation tasks when
// GROQ_API_KEY is set — bypassing both the Lovable AI Gateway (out of credits)
// and Gemini (permission denied). Image and voice pipelines are unaffected.
import { makeProviderError } from "./provider-error";

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_PRIMARY_MODEL = "qwen/qwen3-32b";
export const GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile";

export function groqEnabled(): boolean {
  return !!process.env.GROQ_API_KEY;
}

function isFallbackWorthy(status: number): boolean {
  // model unavailable / rate limit / temporary provider errors
  return status === 404 || status === 400 || status === 429 || status >= 500;
}

async function callOnce(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  json: boolean,
): Promise<{ ok: true; content: string; model: string; status: number; ms: number; requestId: string | null }
           | { ok: false; status: number; body: string; ms: number; requestId: string | null; retryAfter: string | null }> {
  const startedAt = Date.now();
  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
    return { ok: false, status: res.status, body, ms, requestId, retryAfter: res.headers.get("retry-after") };
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return { ok: true, content, model, status: res.status, ms, requestId };
}

function extractGroqMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    return j?.error?.message || j?.message || "";
  } catch {
    return "";
  }
}

/** Calls Groq with primary model, falling back to the secondary model on
 *  model-unavailable / rate-limit / transient errors. Never falls back to
 *  Lovable AI or Gemini. */
export async function groqGenerate(
  system: string,
  user: string,
  json: boolean,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  console.log("[groq] POST %s model=%s json=%s", GROQ_ENDPOINT, GROQ_PRIMARY_MODEL, json);
  let attempt = await callOnce(apiKey, GROQ_PRIMARY_MODEL, system, user, json);
  if (!attempt.ok && isFallbackWorthy(attempt.status)) {
    console.warn("[groq] primary failed (%d), falling back to %s", attempt.status, GROQ_FALLBACK_MODEL);
    attempt = await callOnce(apiKey, GROQ_FALLBACK_MODEL, system, user, json);
  }

  if (!attempt.ok) {
    const msg = extractGroqMessage(attempt.body) || `Groq request failed (${attempt.status})`;
    throw makeProviderError({
      provider: "groq",
      model: GROQ_PRIMARY_MODEL,
      endpoint: GROQ_ENDPOINT,
      httpStatus: attempt.status,
      requestId: attempt.requestId,
      responseTimeMs: attempt.ms,
      retryAfter: attempt.retryAfter,
      message: msg,
      rawBody: attempt.body.slice(0, 20000),
    });
  }

  console.log("[groq] response received model=%s status=%d %dms (%d chars)",
    attempt.model, attempt.status, attempt.ms, attempt.content.length);
  return attempt.content;
}