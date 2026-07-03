import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getActiveProvider, getProviderSettings } from "./lib/provider";
import { recordTelemetry } from "./lib/provider-telemetry";
import { enqueueAi } from "./lib/ai-queue";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Attaches the active AI provider (Gemini key + models from API Settings) to
// every server-function request as headers, so handlers route to Gemini
// without threading params through each function. Runs on the client.
const aiProviderMiddleware = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const p = getActiveProvider();
    const headers: Record<string, string> = {};
    // Route text tasks to Gemini only when a key is connected AND the user's
    // Text provider setting selects Gemini. Honors the API Settings choice so a
    // "built-in" selection is respected instead of silently forced to Gemini.
    const usingGemini = !!p && getProviderSettings().text === "gemini";
    if (usingGemini && p) {
      headers["x-ai-provider"] = p.name;
      headers["x-ai-key"] = p.apiKey;
      headers["x-ai-text-model"] = p.textModel;
      // Fallback removed: never trigger built-in AI before/after Gemini.
      headers["x-ai-fallback"] = "0";
      console.log("[AI] selected provider=gemini model=%s (request started)", p.textModel);
    } else {
      console.log("[AI] selected provider=builtin (no Gemini key connected)");
    }
    try {
      // Funnel through the global AI queue on the browser so we never fire
      // parallel requests at Gemini / built-in AI. SSR bypasses the queue.
      const res =
        typeof window === "undefined"
          ? await next({ headers })
          : await enqueueAi(() => next({ headers }), usingGemini ? "Gemini request" : "AI request");
      console.log("[AI] response received (status=success)");
      recordTelemetry({
        lastProvider: usingGemini ? "gemini" : "builtin",
        lastStatus: "success",
        lastError: null,
      });
      return res;
    } catch (e) {
      console.error("[AI] error details:", e instanceof Error ? e.message : e);
      recordTelemetry({
        lastProvider: usingGemini ? "gemini" : "builtin",
        lastStatus: "error",
        lastError: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [aiProviderMiddleware],
}));
