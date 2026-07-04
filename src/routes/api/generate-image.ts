import { createFileRoute } from "@tanstack/react-router";

// Silent, internal image generation. Images are routed only through the user's
// selected external image provider (Recraft is primary). The built-in AI is
// never used for images.
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI = "https://api.openai.com/v1/images/generations";
const FAL = "https://fal.run";
const REPLICATE = "https://api.replicate.com/v1/models";
const RECRAFT = "https://external.api.recraft.ai/v1/images/generations";
const PROVIDER_REQUIRED =
  "Recraft is not connected. Add your Recraft API key in API Settings and test the connection.";

type Provider = {
  name?: "gemini" | "openai" | "fal" | "replicate" | "recraft" | "builtin";
  apiKey?: string;
  imageModel?: string;
  fallback?: boolean;
};
type Body = { prompt?: string; references?: string[]; provider?: Provider; test?: boolean };

function jsonError(error: string, status = 400, code?: string) {
  console.error("[image] error", { status, code: code ?? null, error });
  return new Response(JSON.stringify({ error, code: code ?? null, status }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Classify an upstream HTTP status into a stable machine code the frontend
 *  maps to a specific, human-readable message. */
function codeForStatus(status: number): string {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 402) return "CREDITS_EXHAUSTED";
  if (status >= 500) return "PROVIDER_ERROR";
  return "PROVIDER_ERROR";
}

/** Turn a lightweight validation response into a normalized result. */
function validationResult(r: Response, label: string): Response {
  if (r.ok) return Response.json({ ok: true });
  const msg =
    r.status === 400 || r.status === 401 || r.status === 403
      ? "Invalid API key."
      : r.status === 429
        ? `Rate limit exceeded (${label}).`
        : `${label} validation failed (${r.status}).`;
  return jsonError(msg, r.status, r.status === 400 ? "AUTH_ERROR" : codeForStatus(r.status));
}

/** Validate a provider with the smallest possible request — never generates a
 *  full image. Uses each provider's lightweight auth/list endpoint. */
async function validateProvider(provider: Provider): Promise<Response> {
  const name = provider.name;
  if (!provider.apiKey) return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
  try {
    if (name === "recraft") {
      const r = await fetch("https://external.api.recraft.ai/v1/users/me", {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return validationResult(r, "Recraft");
    }
    if (name === "gemini") {
      const r = await fetch(`${GOOGLE}?key=${encodeURIComponent(provider.apiKey)}&pageSize=1`);
      return validationResult(r, "Gemini");
    }
    if (name === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return validationResult(r, "OpenAI");
    }
    if (name === "replicate") {
      const r = await fetch("https://api.replicate.com/v1/account", {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return validationResult(r, "Replicate");
    }
    if (name === "fal") {
      // Fal.ai has no lightweight auth-check endpoint; accept a present key.
      return Response.json({ ok: true });
    }
  } catch (e) {
    return jsonError(`Provider validation failed: ${String(e).slice(0, 200)}`, 502, "PROVIDER_ERROR");
  }
  return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
}

/** Log the outcome of an upstream provider call in a redaction-safe way
 *  (never logs the API key itself, only its length/prefix). */
function logProviderCall(
  providerName: string,
  model: string,
  apiKey: string | undefined,
  status: number,
  ok: boolean,
  payloadPreview: string,
) {
  console.log("[image] provider call", {
    provider: providerName,
    model,
    apiKey: apiKey
      ? { length: apiKey.length, prefix: apiKey.slice(0, 4) }
      : "none (built-in)",
    httpStatus: status,
    ok,
    payload: payloadPreview.slice(0, 300),
  });
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
  // Force an image-capable model. Never use a text model (e.g. gemini-2.5-flash).
  let model = provider.imageModel || "";
  if (!model.toLowerCase().includes("image")) {
    model = "gemini-2.5-flash-image";
  }
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
    logProviderCall("gemini", model, provider.apiKey, status, false, text);
    const msg =
      status === 429
        ? "Rate limit exceeded (Gemini). Please wait and try again."
        : status === 400 || status === 403
          ? "Invalid API key — Gemini rejected the request. Check your key in API Settings."
          : `Gemini image generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status, status === 400 ? "AUTH_ERROR" : codeForStatus(status));
  }
  const data = await upstream.json();
  const partsOut = data?.candidates?.[0]?.content?.parts ?? [];
  const inline = partsOut.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
  const b64 = inline?.inlineData?.data;
  logProviderCall("gemini", model, provider.apiKey, upstream.status, true, b64 ? "b64 image" : "no image");
  if (!b64)
    return jsonError("Gemini returned no image for this prompt.", 502, "PROVIDER_ERROR");
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
    logProviderCall("openai", provider.imageModel || "gpt-image-1", provider.apiKey, status, false, text);
    const msg =
      status === 429
        ? "Rate limit exceeded (OpenAI Images). Please wait and try again."
        : status === 400 || status === 401 || status === 403
          ? "Invalid API key — OpenAI Images rejected the request. Check your key and image model in API Settings."
          : `OpenAI Images generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status, status === 400 ? "AUTH_ERROR" : codeForStatus(status));
  }
  const data = await upstream.json();
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (b64) return Response.json({ image: `data:image/png;base64,${b64}` });
  if (typeof url === "string" && url.trim()) return Response.json({ image: url });
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
    logProviderCall("fal", model, provider.apiKey, status, false, text);
    const msg =
      status === 429
        ? "Rate limit exceeded (Fal.ai). Please wait and try again."
        : status === 400 || status === 401 || status === 403
          ? "Invalid API key — Fal.ai rejected the request. Check your key and image model in API Settings."
          : `Fal.ai image generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status, status === 400 ? "AUTH_ERROR" : codeForStatus(status));
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
    logProviderCall("replicate", model, provider.apiKey, status, false, text);
    const msg =
      status === 429
        ? "Rate limit exceeded (Replicate). Please wait and try again."
        : status === 400 || status === 401 || status === 403
          ? "Invalid API key — Replicate rejected the request. Check your key and image model in API Settings."
          : `Replicate image generation failed (${status}): ${text.slice(0, 200)}`;
    return jsonError(msg, status, status === 400 ? "AUTH_ERROR" : codeForStatus(status));
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

async function generateWithRecraft(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel && provider.imageModel.toLowerCase().startsWith("recraft")
    ? provider.imageModel
    : "recraftv4_1_utility_pro";
  const upstream = await fetch(RECRAFT, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: body.prompt,
      model,
      size: "2688x1536",
      response_format: "url",
      n: 1,
    }),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    logProviderCall("recraft", model, provider.apiKey, status, false, text);
    // Surface the REAL Recraft error message whenever the provider returns one.
    let providerMsg = "";
    try {
      const j = JSON.parse(text);
      providerMsg = j?.message || j?.error || j?.detail || "";
    } catch {
      providerMsg = text;
    }
    const msg =
      status === 429
        ? `Rate limit exceeded (Recraft).${providerMsg ? " " + providerMsg : ""}`
        : status === 400 || status === 401 || status === 403
          ? `Recraft rejected the request: ${providerMsg || "invalid API key."}`
          : `Recraft image generation failed (${status}): ${(providerMsg || text).slice(0, 300)}`;
    return jsonError(msg, status, status === 400 || status === 401 || status === 403 ? "AUTH_ERROR" : codeForStatus(status));
  }
  const data = await upstream.json();
  const b64 = data?.data?.[0]?.b64_json;
  const url = firstUrl(data?.data) ?? firstUrl(data);
  logProviderCall("recraft", model, provider.apiKey, upstream.status, true, url ? "url image" : b64 ? "b64 image" : "no image");
  if (b64) return Response.json({ image: `data:image/png;base64,${b64}` });
  if (url) return Response.json({ image: url });
  return jsonError("Recraft returned no image.", 502, "PROVIDER_ERROR");
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const { provider } = body;
        if (!provider?.name) return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");

        // Provider test: smallest possible validation request, never a full image.
        if (body.test) return validateProvider(provider);
        if (!body.prompt?.trim()) return jsonError("Missing prompt", 400, "BAD_REQUEST");

        console.log("[image] request received", {
          provider: provider.name,
          model: provider.imageModel ?? "(default)",
          test: !!body.test,
          references: (body.references ?? []).length,
        });

        if (!provider.apiKey) return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
        if (provider.name === "recraft") return generateWithRecraft(body, provider);
        if (provider.name === "gemini") return generateWithGemini(body, provider);
        if (provider.name === "openai") return generateWithOpenAI(body, provider);
        if (provider.name === "fal") return generateWithFal(body, provider);
        if (provider.name === "replicate") return generateWithReplicate(body, provider);
        return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
      },
    },
  },
});