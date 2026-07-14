import { createServerFn } from "@tanstack/react-start";
import { callAiJson, callAiText } from "./ai-gateway.server";
import { readProviderFromHeaders } from "./provider.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/{model}:generateContent";

interface StepResult {
  module: string;
  endpoint: string;
  provider: string;
  status: number | "ok" | "error";
  ok: boolean;
  detail: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; detail: string }> {
  try {
    const out = await fn();
    const text = typeof out === "string" ? out : JSON.stringify(out);
    return { ok: true, detail: text.slice(0, 160) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export const runRecoveryTest = createServerFn({ method: "POST" }).handler(async (): Promise<StepResult[]> => {
  const p = readProviderFromHeaders();
  const endpoint = p?.name === "gemini" ? GEMINI.replace("{model}", p.textModel) : GATEWAY;
  const provider = p ? `${p.name} (${p.textModel})` : "lovable-gateway";
  const results: StepResult[] = [];

  // Research test — small JSON
  {
    const r = await timed(() =>
      callAiJson<{ ok: boolean }>("You are a test.", "Return JSON: {\"ok\": true}"),
    );
    results.push({ module: "Research", endpoint, provider, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // Story test — short text
  {
    const r = await timed(() => callAiText("You are a test.", "Say the single word: STORY_OK"));
    results.push({ module: "Story", endpoint, provider, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // SEO test — non-empty JSON fields
  {
    const r = await timed(() =>
      callAiJson<{ title: string; description: string }>(
        "You are a YouTube SEO expert.",
        "Return JSON with non-empty title and description for a documentary about honeybees.",
      ),
    );
    results.push({ module: "SEO", endpoint, provider, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // Rating test — JSON scorecard
  {
    const r = await timed(() =>
      callAiJson<{ score: number; verdict: string }>(
        "You are a documentary reviewer.",
        "Return JSON {score:1-10, verdict:string} rating this line: 'The forgotten origin of the paperclip'.",
      ),
    );
    results.push({ module: "Rating", endpoint, provider, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  return results;
});
