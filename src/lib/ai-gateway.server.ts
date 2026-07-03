import { readProviderFromHeaders, geminiGenerateText } from "./provider.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

/** Raised when the AI gateway reports credits are exhausted (HTTP 402). */
export class CreditsExhaustedError extends Error {
  constructor() {
    super("CREDITS_EXHAUSTED");
    this.name = "CreditsExhaustedError";
  }
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
 * Calls the Lovable AI Gateway and returns parsed JSON.
 * `schemaHint` is appended so the model knows the exact shape to return.
 */
export async function callAiJson<T = unknown>(
  system: string,
  user: string,
): Promise<T> {
  const fullSystem = `${system}\n\nCRITICAL OUTPUT RULES: Respond with a single valid JSON value ONLY. No markdown, no code fences, no commentary before or after the JSON. Do not truncate. Ensure every brace and bracket is closed.`;

  // When a Gemini provider is active, route there and NEVER touch the built-in
  // Lovable AI. Any Gemini error is surfaced as-is (no fallback) so users see
  // the real cause instead of a built-in "out of credits" message.
  const provider = readProviderFromHeaders();
  if (provider) {
    console.log("[AI] provider=gemini task=json model=%s request started", provider.textModel);
    let content: string;
    try {
      content = await geminiGenerateText(provider.apiKey, provider.textModel, fullSystem, user, true);
    } catch (e) {
      console.error("[AI] gemini request failed:", e instanceof Error ? e.message : e);
      throw e; // surface the REAL Gemini error — do not fall back to built-in
    }
    console.log("[AI] provider=gemini response received (%d chars)", content.length);
    try {
      return extractJson<T>(content);
    } catch {
      console.error("[AI] gemini JSON parse failed");
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
    if (res.status === 429)
      throw new Error("Rate limited by AI gateway. Please wait and try again.");
    if (res.status === 402)
      throw new CreditsExhaustedError();
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
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
  const provider = readProviderFromHeaders();
  if (provider) {
    console.log("[AI] provider=gemini task=text model=%s request started", provider.textModel);
    try {
      const out = await geminiGenerateText(provider.apiKey, provider.textModel, system, user, false);
      console.log("[AI] provider=gemini response received (%d chars)", out.length);
      return out;
    } catch (e) {
      console.error("[AI] gemini request failed:", e instanceof Error ? e.message : e);
      throw e; // surface the REAL Gemini error — do not fall back to built-in
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
    if (res.status === 429)
      throw new Error("Rate limited by AI gateway. Please wait and try again.");
    if (res.status === 402)
      throw new CreditsExhaustedError();
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}