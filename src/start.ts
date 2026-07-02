import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getActiveProvider } from "./lib/provider";

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
    if (p) {
      headers["x-ai-provider"] = p.name;
      headers["x-ai-key"] = p.apiKey;
      headers["x-ai-text-model"] = p.textModel;
    }
    return next({ headers });
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [aiProviderMiddleware],
}));
