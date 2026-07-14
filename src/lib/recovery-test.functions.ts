import { createServerFn } from "@tanstack/react-start";
import { callAiJson, callAiText } from "./ai-gateway.server";
import { readProviderFromHeaders } from "./provider.server";
import { pickGeminiTextModel } from "./gemini-models.server";

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

export interface RecoveryReport {
  apiKeyValid: boolean;
  selectedModel: string;
  endpoint: string;
  listStatus: number;
  listedCount: number;
  candidates: string[];
  rawError?: string;
  probe: StepResult;
  results: StepResult[];
}

export const runRecoveryTest = createServerFn({ method: "POST" }).handler(async (): Promise<RecoveryReport> => {
  const p = readProviderFromHeaders();
  const results: StepResult[] = [];

  // Baseline diagnostics: list models against Google using the saved key.
  let selectedModel = "";
  let endpoint = GATEWAY;
  let listStatus = 0;
  let listedCount = 0;
  let candidates: string[] = [];
  let rawError: string | undefined;
  let apiKeyValid = false;

  if (p?.name === "gemini") {
    const pick = await pickGeminiTextModel(p.apiKey, { force: true });
    selectedModel = pick.model;
    endpoint = pick.endpoint || GEMINI.replace("{model}", p.textModel);
    listStatus = pick.listStatus;
    listedCount = pick.listedCount;
    candidates = pick.candidates.slice(0, 12);
    rawError = pick.rawError;
    apiKeyValid = pick.listOk;
  } else {
    apiKeyValid = false;
  }

  const providerLabel = p ? `${p.name} (${selectedModel || p.textModel})` : "lovable-gateway";

  // Internal text probe — must return "Text provider working".
  const probe = await timed(() =>
    callAiText(
      "You are an operational probe. Follow the instruction literally.",
      "Reply only with: Text provider working",
    ),
  );
  const probeRow: StepResult = {
    module: "Text probe",
    endpoint,
    provider: providerLabel,
    status: probe.ok ? "ok" : "error",
    ok: probe.ok && /text provider working/i.test(probe.detail),
    detail: probe.detail,
  };
  results.push(probeRow);

  // Research test — small JSON
  {
    const r = await timed(() =>
      callAiJson<{ ok: boolean }>("You are a test.", "Return JSON: {\"ok\": true}"),
    );
    results.push({ module: "Research", endpoint, provider: providerLabel, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // Story test — short text
  {
    const r = await timed(() => callAiText("You are a test.", "Say the single word: STORY_OK"));
    results.push({ module: "Story", endpoint, provider: providerLabel, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // SEO test — non-empty JSON fields
  {
    const r = await timed(() =>
      callAiJson<{ title: string; description: string }>(
        "You are a YouTube SEO expert.",
        "Return JSON with non-empty title and description for a documentary about honeybees.",
      ),
    );
    results.push({ module: "SEO", endpoint, provider: providerLabel, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // Rating test — JSON scorecard
  {
    const r = await timed(() =>
      callAiJson<{ score: number; verdict: string }>(
        "You are a documentary reviewer.",
        "Return JSON {score:1-10, verdict:string} rating this line: 'The forgotten origin of the paperclip'.",
      ),
    );
    results.push({ module: "Rating", endpoint, provider: providerLabel, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // Script Analyzer test — short text
  {
    const r = await timed(() =>
      callAiText(
        "You are a script analyzer.",
        "One-line critique of: 'The hidden origin of the paperclip.'",
      ),
    );
    results.push({ module: "Script Analyzer", endpoint, provider: providerLabel, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  // Thumbnail concept text test — JSON
  {
    const r = await timed(() =>
      callAiJson<{ concept: string }>(
        "You are a YouTube thumbnail concept writer.",
        "Return JSON {concept:string} — one thumbnail concept for a paperclip documentary.",
      ),
    );
    results.push({ module: "Thumbnail concept", endpoint, provider: providerLabel, status: r.ok ? "ok" : "error", ok: r.ok, detail: r.detail });
  }
  return {
    apiKeyValid,
    selectedModel,
    endpoint,
    listStatus,
    listedCount,
    candidates,
    rawError,
    probe: probeRow,
    results,
  };
});
