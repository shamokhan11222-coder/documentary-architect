// Server-side view of the active AI provider. The client middleware in
// src/start.ts attaches the provider on request headers for every server
// function call, so any handler can resolve it without threading params.
import { getRequestHeader } from "@tanstack/react-start/server";

export interface ServerProvider {
  name: "gemini";
  apiKey: string;
  textModel: string;
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
  const res = await fetch(`${GEMINI}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: json ? { responseMimeType: "application/json" } : {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Gemini rate limit reached. Please wait and try again.");
    if (res.status === 400 || res.status === 403)
      throw new Error("Gemini rejected the request — check your API key in API Settings.");
    throw new Error(`Gemini request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}
