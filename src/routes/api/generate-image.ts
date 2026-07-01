import { createFileRoute } from "@tanstack/react-router";

// Silent, internal image generation. Uses a Gemini image model so we can feed
// Visual DNA reference images for perfect character/style consistency.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/images/generations";
const MODEL = "google/gemini-3.1-flash-image";

type Body = { prompt?: string; references?: string[] };

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, references } = (await request.json()) as Body;
        if (!prompt?.trim()) return new Response("Missing prompt", { status: 400 });
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