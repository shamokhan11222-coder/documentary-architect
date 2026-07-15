import { readProviderFromHeaders, geminiGenerateText, openaiGenerateText } from "./provider.server";
import { makeProviderError } from "./provider-error";
import { groqEnabled, groqGenerate } from "./groq.server";
import { openrouterEnabled, openrouterGenerate } from "./openrouter.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

/**
 * Raised when the AI gateway reports credits are exhausted (HTTP 402).
 * Kept as a plain Error subclass for backward-compat, but callers inside this
 * module now throw a structured ProviderError instead so the client can render
 * an inline "AI credits are exhausted." message with a Retry button instead of
 * crashing to the global error boundary.
 */
export class CreditsExhaustedError extends Error {
  constructor() {
    super("CREDITS_EXHAUSTED");
    this.name = "CreditsExhaustedError";
  }
}

function creditsExhaustedProviderError(
  status: number,
  rawBody: string,
  requestId: string | null,
  retryAfter: string | null,
): Error {
  return makeProviderError({
    provider: "lovable-gateway",
    model: MODEL,
    endpoint: GATEWAY_URL,
    httpStatus: status,
    requestId,
    responseTimeMs: null,
    retryAfter,
    message: "AI credits are exhausted.",
    rawBody: rawBody.slice(0, 20000),
  });
}

/**
 * Robustly extract a JSON value from a raw model response. Strips markdown
 * fences, trims surrounding prose, and repairs common issues (trailing commas,
 * stray control characters) before parsing. Throws if nothing parseable.
 */
export function extractJson<T = unknown>(raw: string): T {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = cleaned.search(/[[{]/);
  if (start !== -1) {
    const open = cleaned[start];
    const close = open === "[" ? "]" : "}";
    const end = cleaned.lastIndexOf(close);
    if (end > start) cleaned = cleaned.slice(start, end + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const repaired = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\u0000-\u001F\u007F]/g, " ");
    return JSON.parse(repaired) as T;
  }
}

/**
 * Force the Lovable AI Gateway for JSON generation, ignoring any BYOK Gemini /
 * OpenAI provider headers. Used ONLY by features that must never touch the
 * user's Google AI Studio key (e.g. thumbnail concept generation). Research,
 * Story, SEO, Rating and Voice keep using callAiJson and their existing routing.
 */
export async function callAiJsonGateway<T = unknown>(
  system: string,
  user: string,
): Promise<T> {
  const fullSystem = `${system}\n\nCRITICAL OUTPUT RULES: Respond with a single valid JSON value ONLY. No markdown, no code fences, no commentary before or after the JSON. Do not truncate. Ensure every brace and bracket is closed.`;
  // Groq is the permanent text provider. Bypass the Lovable AI Gateway when
  // GROQ_API_KEY is configured — even for callers that historically forced
  // the built-in gateway (e.g. thumbnail concept text).
  if (openrouterEnabled()) {
    const content = await openrouterGenerate(fullSystem, user, true);
    try {
      return extractJson<T>(content);
    } catch {
      const err = new Error("AI returned unparseable output.") as Error & { code?: string; raw?: string };
      err.code = "JSON_PARSE_FAILED";
      err.raw = content.slice(0, 20000);
      throw err;
    }
  }
  if (groqEnabled()) {
    const content = await groqGenerate(fullSystem, user, true);
    try {
      return extractJson<T>(content);
    } catch {
      const err = new Error("AI returned unparseable output.") as Error & { code?: string; raw?: string };
      err.code = "JSON_PARSE_FAILED";
      err.raw = content.slice(0, 20000);
      throw err;
    }
  }
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: fullSystem },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402)
      throw creditsExhaustedProviderError(
        res.status,
        text,
        res.headers.get("x-request-id"),
        res.headers.get("retry-after"),
      );
    let msg = `AI gateway request failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || msg;
    } catch { /* keep default */ }
    throw makeProviderError({
      provider: "lovable-gateway",
      model: MODEL,
      endpoint: GATEWAY_URL,
      httpStatus: res.status,
      requestId: res.headers.get("x-request-id"),
      responseTimeMs: null,
      retryAfter: res.headers.get("retry-after"),
      message: msg,
      rawBody: text.slice(0, 20000),
    });
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  try {
    return extractJson<T>(content);
  } catch {
    const err = new Error("AI returned unparseable output.") as Error & { code?: string; raw?: string };
    err.code = "JSON_PARSE_FAILED";
    err.raw = content.slice(0, 20000);
    throw err;
  }
}

/**
 * Calls the Lovable AI Gateway and returns parsed JSON, honoring an active BYOK
 * Gemini/OpenAI provider when one is set (shared by Research, Story, SEO, etc.).
 */
export async function callAiJson<T = unknown>(
  system: string,
  user: string,
): Promise<T> {
  const fullSystem = `${system}\n\nCRITICAL OUTPUT RULES: Respond with a single valid JSON value ONLY. No markdown, no code fences, no commentary before or after the JSON. Do not truncate. Ensure every brace and bracket is closed.`;

  // OpenRouter wins over everything else when configured — never touches
  // Lovable AI credits nor the user's Gemini key. Groq stays as a legacy
  // secondary path only if OpenRouter is not set.
  if (openrouterEnabled()) {
    console.log("[AI] provider=openrouter task=json request started");
    const content = await openrouterGenerate(fullSystem, user, true);
    try {
      return extractJson<T>(content);
    } catch {
      console.error("[AI] openrouter JSON parse failed");
      const err = new Error("AI returned unparseable output.") as Error & { code?: string; raw?: string };
      err.code = "JSON_PARSE_FAILED";
      err.raw = content.slice(0, 20000);
      throw err;
    }
  }
  if (groqEnabled()) {
    console.log("[AI] provider=groq task=json request started");
    const content = await groqGenerate(fullSystem, user, true);
    try {
      return extractJson<T>(content);
    } catch {
      console.error("[AI] groq JSON parse failed");
      const err = new Error("AI returned unparseable output.") as Error & { code?: string; raw?: string };
      err.code = "JSON_PARSE_FAILED";
      err.raw = content.slice(0, 20000);
      throw err;
    }
  }

  // When a Gemini provider is active, route there and NEVER touch the built-in
  // Lovable AI. Any Gemini error is surfaced as-is (no fallback) so users see
  // the real cause instead of a built-in "out of credits" message.
  const provider = readProviderFromHeaders();
  if (provider) {
    console.log("[AI] provider=%s task=json model=%s request started", provider.name, provider.textModel);
    let content: string;
    try {
      content =
        provider.name === "openai"
          ? await openaiGenerateText(provider.apiKey, provider.textModel, fullSystem, user, true)
          : await geminiGenerateText(provider.apiKey, provider.textModel, fullSystem, user, true);
    } catch (e) {
      console.error("[AI] %s request failed:", provider.name, e instanceof Error ? e.message : e);
      throw e; // surface the REAL provider error — do not fall back to built-in
    }
    console.log("[AI] provider=%s response received (%d chars)", provider.name, content.length);
    try {
      return extractJson<T>(content);
    } catch {
      console.error("[AI] %s JSON parse failed", provider.name);
      const err = new Error("AI returned unparseable output.") as Error & { code?: string; raw?: string };
      err.code = "JSON_PARSE_FAILED";
      err.raw = content.slice(0, 20000);
      throw err;
    }
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: fullSystem,
        },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402) throw creditsExhaustedProviderError(res.status, text, res.headers.get("x-request-id"), res.headers.get("retry-after"));
    let msg = `AI gateway request failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || msg;
    } catch { /* keep default */ }
    throw makeProviderError({
      provider: "lovable-gateway",
      model: MODEL,
      endpoint: GATEWAY_URL,
      httpStatus: res.status,
      requestId: res.headers.get("x-request-id"),
      responseTimeMs: null,
      retryAfter: res.headers.get("retry-after"),
      message: msg,
      rawBody: text.slice(0, 20000),
    });
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  try {
    return extractJson<T>(content);
  } catch {
    // Preserve the raw response so the UI can offer a recovery action.
    const err = new Error("AI returned unparseable output.") as Error & {
      code?: string;
      raw?: string;
    };
    err.code = "JSON_PARSE_FAILED";
    err.raw = content.slice(0, 20000);
    throw err;
  }
}

export async function callAiText(system: string, user: string): Promise<string> {
  if (groqEnabled()) {
    console.log("[AI] provider=groq task=text request started");
    return await groqGenerate(system, user, false);
  }
  const provider = readProviderFromHeaders();
  if (provider) {
    console.log("[AI] provider=%s task=text model=%s request started", provider.name, provider.textModel);
    try {
      const out =
        provider.name === "openai"
          ? await openaiGenerateText(provider.apiKey, provider.textModel, system, user, false)
          : await geminiGenerateText(provider.apiKey, provider.textModel, system, user, false);
      console.log("[AI] provider=%s response received (%d chars)", provider.name, out.length);
      return out;
    } catch (e) {
      console.error("[AI] %s request failed:", provider.name, e instanceof Error ? e.message : e);
      throw e; // surface the REAL provider error — do not fall back to built-in
    }
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402) throw creditsExhaustedProviderError(res.status, text, res.headers.get("x-request-id"), res.headers.get("retry-after"));
    let msg = `AI gateway request failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || msg;
    } catch { /* keep default */ }
    throw makeProviderError({
      provider: "lovable-gateway",
      model: MODEL,
      endpoint: GATEWAY_URL,
      httpStatus: res.status,
      requestId: res.headers.get("x-request-id"),
      responseTimeMs: null,
      retryAfter: res.headers.get("retry-after"),
      message: msg,
      rawBody: text.slice(0, 20000),
    });
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}