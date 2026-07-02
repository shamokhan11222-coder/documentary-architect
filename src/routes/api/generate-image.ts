import { createFileRoute } from "@tanstack/react-router";

// Silent, internal image generation. Uses a Gemini image model so we can feed
// Visual DNA reference images for perfect character/style consistency.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/images/generations";
const MODEL = "google/gemini-3.1-flash-image";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";

type Provider = { name?: string; apiKey?: string; imageModel?: string; fallback?: boolean };
type Body = { prompt?: string; references?: string[]; provider?: Provider };

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
    return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
  }
  const data = await upstream.json();
  const partsOut = data?.candidates?.[0]?.content?.parts ?? [];
  const inline = partsOut.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
  const b64 = inline?.inlineData?.data;
  if (!b64)
    return new Response(JSON.stringify({ error: "Gemini returned no image for this prompt." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  const mime = inline.inlineData.mimeType || "image/png";
  return Response.json({ image: `data:${mime};base64,${b64}` });
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const { prompt, references, provider } = body;
        if (!prompt?.trim()) return new Response("Missing prompt", { status: 400 });

        // Active Gemini provider → use the user's key directly.
        if (provider?.name === "gemini" && provider.apiKey) {
          const r = await generateWithGemini(body, provider);
          // On failure, fall through to built-in AI only if fallback is enabled.
          if (r.ok || !provider.fallback) return r;
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const content: unknown[] = [{ type: "text", text: prompt }];
        for (const ref of (references ?? []).slice(0, 6)) {
          if (typeof ref === "string" && ref.startsWith("data:")) {
            content.push({ type: "image_url", image_url: { url: ref } });
          }
        }

        const upstream = await fetch(GATEWAY, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          const status = upstream.status;
          const msg =
            status === 429
              ? "Rate limited. Please wait and try again."
              : status === 402
                ? "AI credits exhausted. Add credits in workspace settings."
                : `Image generation failed (${status}): ${text.slice(0, 200)}`;
          return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
        }

        const data = await upstream.json();
        const b64 = data?.data?.[0]?.b64_json;
        if (!b64) return new Response(JSON.stringify({ error: "No image returned" }), { status: 502, headers: { "Content-Type": "application/json" } });
        return Response.json({ image: `data:image/png;base64,${b64}` });
      },
    },
  },
});