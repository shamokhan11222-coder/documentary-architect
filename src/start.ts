import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getActiveTextProvider } from "./lib/provider";
import { recordTelemetry } from "./lib/provider-telemetry";
import { enqueueAi } from "./lib/ai-queue";
import { GEMINI_TEXT_MODEL_DEFAULT_FULL, normalizeGeminiModel } from "./lib/gemini-model";
import { getOpenRouterSettings } from "./lib/openrouter";

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
    const p = getActiveTextProvider();
    const externalProviderDisabled = true;
    const activeProvider = externalProviderDisabled ? null : p;
    const headers: Record<string, string> = {};
    // Attach the user's OpenRouter model preferences so the server picks the
    // exact primary/fallback selected in API Settings. Free defaults still
    // apply on the server if these headers are absent or empty.
    try {
      const or = getOpenRouterSettings();
      if (or.primary) headers["x-openrouter-primary"] = or.primary;
      if (or.fallback) headers["x-openrouter-fallback"] = or.fallback;
    } catch {
      /* localStorage unavailable during SSR */
    }
    // Route text tasks to the selected Text Provider (Gemini or OpenAI) when a
    // matching key is connected. A "built-in" selection (or no key) is honored
    // by leaving the headers off so the server uses the built-in AI.
    const usingExternal = !!activeProvider;
    if (activeProvider) {
      headers["x-ai-provider"] = activeProvider.name;
      headers["x-ai-key"] = activeProvider.apiKey;
      const finalTextModel = activeProvider.name === "gemini" ? normalizeGeminiModel(activeProvider.textModel) || GEMINI_TEXT_MODEL_DEFAULT_FULL : activeProvider.textModel;
      headers["x-ai-text-model"] = finalTextModel;
      // Fallback removed: never trigger built-in AI before/after the provider.
      headers["x-ai-fallback"] = "0";
      if (activeProvider.name === "gemini") console.log(`Final Gemini model sent: ${finalTextModel}`);
      console.log("[AI] selected provider=%s model=%s (request started)", activeProvider.name, finalTextModel);
    } else {
      console.log("[AI] selected provider=builtin (no external text key connected)");
    }
    try {
      // Funnel through the global AI queue on the browser so we never fire
      // parallel requests at Gemini / built-in AI. SSR bypasses the queue.
      const res =
        typeof window === "undefined"
          ? await next({ headers })
          : await enqueueAi(() => next({ headers }), usingExternal ? `${activeProvider!.name} request` : "AI request");
      console.log("[AI] response received (status=success)");
      recordTelemetry({
        lastProvider: activeProvider ? activeProvider.name : "builtin",
        lastStatus: "success",
        lastError: null,
      });
      return res;
    } catch (e) {
      console.error("[AI] error details:", e instanceof Error ? e.message : e);
      recordTelemetry({
        lastProvider: activeProvider ? activeProvider.name : "builtin",
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
