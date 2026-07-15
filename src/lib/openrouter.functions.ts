// Server functions exposed to the API Settings UI: list free OpenRouter models
// and run a connection test against the currently-selected models. The
// OPENROUTER_API_KEY lives only on the server (process.env) and is never
// returned to the browser.
import { createServerFn } from "@tanstack/react-start";
import { OPENROUTER_ENDPOINT, OPENROUTER_DEFAULT_MODELS, openrouterCallOnce } from "./openrouter.server";

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  free: boolean;
}

export const listOpenRouterModels = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: true; models: OpenRouterModel[] } | { ok: false; message: string }> => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return { ok: false, message: "OPENROUTER_API_KEY is not configured on the server." };
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, message: `Models endpoint returned HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        }>;
      };
      const list = (data?.data ?? []).map((m) => {
        const prompt = Number(m.pricing?.prompt ?? "0");
        const completion = Number(m.pricing?.completion ?? "0");
        const free = prompt === 0 && completion === 0;
        return {
          id: m.id,
          name: m.name ?? m.id,
          contextLength: m.context_length ?? null,
          free,
        };
      });
      // Free models first, alphabetically inside each bucket.
      list.sort((a, b) => (a.free === b.free ? a.id.localeCompare(b.id) : a.free ? -1 : 1));
      return { ok: true, models: list };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Model listing failed." };
    }
  },
);

export const testOpenRouterConnection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { primary?: string; fallback?: string };
    return {
      primary: (v.primary ?? "").trim() || OPENROUTER_DEFAULT_MODELS[0],
      fallback: (v.fallback ?? "").trim() || OPENROUTER_DEFAULT_MODELS[1],
    };
  })
  .handler(
    async ({ data }): Promise<
      | { ok: true; provider: "OpenRouter"; model: string; endpoint: string; httpStatus: number; responseTimeMs: number; fallbackUsed: boolean; reply: string }
      | { ok: false; provider: "OpenRouter"; message: string; httpStatus: number | null; endpoint: string; model: string | null }
    > => {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key)
        return {
          ok: false,
          provider: "OpenRouter",
          message: "OPENROUTER_API_KEY is not configured on the server.",
          httpStatus: null,
          endpoint: OPENROUTER_ENDPOINT,
          model: null,
        };
      const chain = Array.from(new Set([data.primary, data.fallback, ...OPENROUTER_DEFAULT_MODELS]));
      const system = "Reply only with: OpenRouter connected";
      const user = "Test";
      let last: Awaited<ReturnType<typeof openrouterCallOnce>> | null = null;
      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        const r = await openrouterCallOnce(key, model, system, user, false);
        if (r.ok) {
          return {
            ok: true,
            provider: "OpenRouter",
            model: r.model,
            endpoint: OPENROUTER_ENDPOINT,
            httpStatus: r.status,
            responseTimeMs: r.ms,
            fallbackUsed: i > 0,
            reply: r.content.trim(),
          };
        }
        last = r;
        // Only walk on retryable errors
        if (r.status !== 429 && r.status !== 402 && r.status !== 404 && r.status !== 400 && r.status < 500) break;
      }
      const a = last!;
      let msg = `OpenRouter request failed (${a.status})`;
      try {
        const j = JSON.parse(a.body) as { error?: { message?: string } };
        if (j?.error?.message) msg = j.error.message;
      } catch {
        /* keep default */
      }
      return {
        ok: false,
        provider: "OpenRouter",
        message: msg,
        httpStatus: a.status,
        endpoint: OPENROUTER_ENDPOINT,
        model: a.model,
      };
    },
  );