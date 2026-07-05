// Server-side view of the active AI provider. The client middleware in
// src/start.ts attaches the provider on request headers for every server
// function call, so any handler can resolve it without threading params.
import { getRequestHeader } from "@tanstack/react-start/server";
import { makeProviderError } from "./provider-error";

export interface ServerProvider {
  name: "gemini" | "openai";
  apiKey: string;
  textModel: string;
  fallback: boolean;
}

export function readProviderFromHeaders(): ServerProvider | null {
  try {
    const name = getRequestHeader("x-ai-provider");
    const apiKey = getRequestHeader("x-ai-key");
    if (name === "gemini" && apiKey) {
      return {
        name: "gemini",
        apiKey,
        textModel: getRequestHeader("x-ai-text-model") || "gemini-2.5-flash",
        fallback: getRequestHeader("x-ai-fallback") === "1",
      };
    }
    if (name === "openai" && apiKey) {
      return {
        name: "openai",
        apiKey,
        textModel: getRequestHeader("x-ai-text-model") || "gpt-4o-mini",
        fallback: getRequestHeader("x-ai-fallback") === "1",
      };
    }
  } catch {
    /* headers unavailable (e.g. non-request context) */
  }
  return null;
}

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

/** Direct call to Google's Generative Language API. Returns raw text output. */
export async function geminiGenerateText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  json: boolean,
): Promise<string> {
  const endpoint = `${GEMINI}/${model}:generateContent`;
  const startedAt = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: json ? { responseMimeType: "application/json" } : {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw makeProviderError({
      provider: "gemini",
      model,
      endpoint,
      httpStatus: res.status,
      requestId: res.headers.get("x-request-id") ?? res.headers.get("x-goog-request-id"),
      responseTimeMs: Date.now() - startedAt,
      retryAfter: res.headers.get("retry-after"),
      message: extractGoogleMessage(text) || `Gemini request failed (${res.status})`,
      rawBody: text.slice(0, 20000),
    });
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

/** Pulls the exact `error.message` out of a Google/Gemini JSON error body. */
function extractGoogleMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    if (Array.isArray(j)) {
      for (const item of j) {
        const msg = item?.error?.message || item?.message || "";
        if (msg) return msg;
      }
    }
    return j?.error?.message || j?.message || "";
  } catch {
    return "";
  }
}

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Direct call to OpenAI's Chat Completions API. Returns raw text output. */
export async function openaiGenerateText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  json: boolean,
): Promise<string> {
  const startedAt = Date.now();
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw makeProviderError({
      provider: "openai",
      model,
      endpoint: OPENAI_CHAT,
      httpStatus: res.status,
      requestId: res.headers.get("x-request-id"),
      responseTimeMs: Date.now() - startedAt,
      retryAfter: res.headers.get("retry-after"),
      message: extractGoogleMessage(text) || `OpenAI request failed (${res.status})`,
      rawBody: text.slice(0, 20000),
    });
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
