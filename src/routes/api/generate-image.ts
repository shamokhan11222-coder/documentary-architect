import { createFileRoute } from "@tanstack/react-router";

// Silent, internal image generation. Images are routed only through the user's
// selected external image provider. Built-in AI is intentionally disabled here.
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI = "https://api.openai.com/v1/images/generations";
const FAL = "https://fal.run";
const REPLICATE = "https://api.replicate.com/v1/models";
const PROVIDER_REQUIRED = "Image provider not connected. Connect Gemini Image, OpenAI Images, Fal.ai, or Replicate.";

type Provider = { name?: "gemini" | "openai" | "fal" | "replicate"; apiKey?: string; imageModel?: string; fallback?: boolean };
type Body = { prompt?: string; references?: string[]; provider?: Provider; test?: boolean };

function jsonError(error: string, status = 400) {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

function firstUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = firstUrl(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  return firstUrl(obj.url) ?? firstUrl(obj.image) ?? firstUrl(obj.images) ?? firstUrl(obj.output) ?? firstUrl(obj.data);
}

function toInlineData(ref: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(ref);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

// Generate through the user's own Google Gemini key (no Lovable AI involved).
async function generateWithGemini(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel || "gemini-2.5-flash-image";
  const parts: unknown[] = [{ text: body.prompt }];
  for (const ref of (body.references ?? []).slice(0, 6)) {
    const inline = typeof ref === "string" && ref.startsWith("data:") ? toInlineData(ref) : null;
    if (inline) parts.push(inline);
  }
  const upstream = await fetch(
    `${GOOGLE}/${model}:generateContent?key=${encodeURIComponent(provider.apiKey ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    },
  );
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    const msg =
      status === 429
        ? "Gemini rate limit reached. Please wait and try again."
        : status === 400 || status === 403
          ? "Gemini rejected the request — check your API key in API Settings."
          : `Gemini image generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status);
  }
  const data = await upstream.json();
  const partsOut = data?.candidates?.[0]?.content?.parts ?? [];
  const inline = partsOut.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
  const b64 = inline?.inlineData?.data;
  if (!b64)
    return jsonError("Gemini returned no image for this prompt.", 502);
  const mime = inline.inlineData.mimeType || "image/png";
  return Response.json({ image: `data:${mime};base64,${b64}` });
}

async function generateWithOpenAI(body: Body, provider: Provider): Promise<Response> {
  const upstream = await fetch(OPENAI, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.imageModel || "gpt-image-1",
      prompt: body.prompt,
      size: "1024x1024",
      n: 1,
    }),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    const msg =
      status === 429
        ? "OpenAI Images rate limit reached. Please wait and try again."
        : status === 400 || status === 401 || status === 403
          ? "OpenAI Images rejected the request — check your API key and image model in API Settings."
          : `OpenAI Images generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status);
  }
  const data = await upstream.json();
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (b64) return Response.json({ image: `data:image/png;base64,${b64}` });
  if (typeof url === "string") return Response.json({ image: url });
  return jsonError("OpenAI Images returned no image.", 502);
}

async function generateWithFal(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel || "fal-ai/flux/schnell";
  const upstream = await fetch(`${FAL}/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: body.prompt, image_size: "landscape_16_9", num_images: 1 }),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    const msg =
      status === 429
        ? "Fal.ai rate limit reached. Please wait and try again."
        : status === 400 || status === 401 || status === 403
          ? "Fal.ai rejected the request — check your API key and image model in API Settings."
          : `Fal.ai image generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status);
  }
  const data = await upstream.json();
  const url = firstUrl(data);
  if (url) return Response.json({ image: url });
  return jsonError("Fal.ai returned no image.", 502);
}

async function generateWithReplicate(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel || "black-forest-labs/flux-schnell";
  const create = await fetch(`${REPLICATE}/${model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt: body.prompt, aspect_ratio: "16:9", output_format: "png" } }),
  });
  if (!create.ok) {
    const text = await create.text().catch(() => "");
    const status = create.status;
    const msg =
      status === 429
        ? "Replicate rate limit reached. Please wait and try again."
        : status === 400 || status === 401 || status === 403
          ? "Replicate rejected the request — check your API key and image model in API Settings."
          : `Replicate image generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status);
  }
  let data = await create.json();
  for (let i = 0; i < 20 && data?.status !== "succeeded" && data?.status !== "failed" && data?.status !== "canceled"; i++) {
    if (!data?.urls?.get) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await fetch(data.urls.get, { headers: { Authorization: `Bearer ${provider.apiKey}` } });
    if (!poll.ok) break;
    data = await poll.json();
  }
  if (data?.status === "failed" || data?.status === "canceled") return jsonError("Replicate image generation failed.", 502);
  const url = firstUrl(data?.output ?? data);
  if (url) return Response.json({ image: url });
  return jsonError("Replicate returned no image.", 502);
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const { prompt, references, provider } = body;
        if (!provider?.name || !provider.apiKey) return jsonError(PROVIDER_REQUIRED, 400);
        if (provider.fallback) return jsonError("Built-in AI fallback is disabled for image generation.", 400);

        if (body.test) {
          body.prompt = "simple clean blue circle icon on white background";
          body.references = [];
        }
        if (!prompt?.trim()) return new Response("Missing prompt", { status: 400 });

        if (provider.name === "gemini") return generateWithGemini(body, provider);
        if (provider.name === "openai") return generateWithOpenAI(body, provider);
        if (provider.name === "fal") return generateWithFal(body, provider);
        if (provider.name === "replicate") return generateWithReplicate(body, provider);
        return jsonError(PROVIDER_REQUIRED, 400);
      },
    },
  },
});