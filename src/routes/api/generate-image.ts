import { createFileRoute } from "@tanstack/react-router";

// Compatibility endpoint only. The active app image pipeline is browser-side:
// generateSceneImage/buildThumbnailPrompt -> generatePipelineImage -> Puter AI
// primary -> Pollinations fallback -> IndexedDB. Gemini/OpenAI/Recraft image
// routes are disabled here so stale clients cannot make paid or forbidden calls.

const GEMINI_IMAGE_DISABLED_MESSAGE = "BUG: Gemini image provider is disabled in Zero-Budget Mode.";
const POLLINATIONS = "https://image.pollinations.ai/prompt";

type Provider = {
  name?: "gemini" | "openai" | "fal" | "replicate" | "recraft" | "huggingface" | "pollinations" | "builtin" | "puter";
  imageModel?: string;
};
type Body = {
  prompt?: string;
  provider?: Provider;
  test?: boolean;
  action?: string;
};

function jsonError(error: string, status = 400, code?: string) {
  console.error("[image] disabled route", { status, code: code ?? null, error });
  return new Response(JSON.stringify({ error, code: code ?? null, status }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function disabledProvider(name: string | undefined): Response {
  if (name === "gemini") return jsonError(GEMINI_IMAGE_DISABLED_MESSAGE, 400, "GEMINI_IMAGE_DISABLED");
  return jsonError("Image provider is disabled in Zero-Budget Mode. Use Puter AI or Pollinations.", 400, "IMAGE_PROVIDER_DISABLED");
}

function firstErrorMessage(text: string): string {
  try {
    const json = JSON.parse(text);
    return json?.error?.message || json?.message || text;
  } catch {
    return text;
  }
}

async function generateWithPollinations(body: Body): Promise<Response> {
  const prompt = body.prompt?.trim();
  if (!prompt) return jsonError("Missing prompt", 400, "BAD_REQUEST");
  const model = body.provider?.imageModel || "flux";
  const url = `${POLLINATIONS}/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=1280&height=720&nologo=true`;
  const upstream = await fetch(url);
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return jsonError(`pollinations ${upstream.status}: ${firstErrorMessage(text)}`, upstream.status, upstream.status === 429 ? "RATE_LIMIT" : "PROVIDER_ERROR");
  }
  const buf = await upstream.arrayBuffer();
  const mime = upstream.headers.get("content-type") || "image/jpeg";
  const b64 = Buffer.from(buf).toString("base64");
  return Response.json({ image: `data:${mime};base64,${b64}`, provider: "pollinations", model });
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (body.action?.toLowerCase().includes("gemini")) return disabledProvider("gemini");
        const name = body.provider?.name;
        if (!name) return jsonError("Zero-Budget image mode uses Puter AI primary and Pollinations fallback.", 400, "NO_PROVIDER");
        if (name === "gemini" || name === "openai" || name === "recraft" || name === "fal" || name === "replicate" || name === "huggingface" || name === "builtin") {
          return disabledProvider(name);
        }
        if (name === "puter") return Response.json({ ok: true, provider: "puter", note: "Puter runs in the browser SDK; no server request is used." });
        if (name === "pollinations") {
          if (body.test) return Response.json({ ok: true, provider: "pollinations" });
          return generateWithPollinations(body);
        }
        return disabledProvider(name);
      },
    },
  },
});