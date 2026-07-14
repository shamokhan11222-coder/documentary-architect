import { createServerFn } from "@tanstack/react-start";
import { callAiJson, callAiText } from "./ai-gateway.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
  const endpoint = GATEWAY;
  const provider = "lovable-gateway";
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
  return results;
});
