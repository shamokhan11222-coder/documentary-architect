import { createFileRoute } from "@tanstack/react-router";

// Text-to-speech for the Voice Studio. Returns base64 mp3 so the client can
// store each paragraph's narration block in IndexedDB and measure duration.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "openai/gpt-4o-mini-tts";

const VOICE_MAP: Record<string, string> = {
  deep: "onyx",
  calm: "sage",
  storyteller: "fable",
  educational: "alloy",
  cinematic: "ash",
};

type Body = {
  text?: string;
  profile?: string;
  speed?: number;
  stability?: number;
  emotion?: number;
  pauseStrength?: number;
  pitch?: number;
};

function buildInstructions(b: Body): string {
  const parts = ["Narrate as a professional YouTube documentary voiceover."];
  switch (b.profile) {
    case "deep":
      parts.push("Deep, authoritative, resonant tone.");
      break;
    case "calm":
      parts.push("Calm, warm, measured and soothing.");
      break;
    case "storyteller":
      parts.push("Engaging storyteller cadence, natural and expressive.");
      break;
    case "educational":
      parts.push("Clear, friendly, explanatory teaching tone.");
      break;
    case "cinematic":
      parts.push("Cinematic, dramatic, trailer-like gravitas.");
      break;
  }
  if ((b.emotion ?? 0) > 0.6) parts.push("Use noticeable emotional expression.");
  else if ((b.emotion ?? 0) < 0.3) parts.push("Keep emotion subtle and even.");
  if ((b.stability ?? 0.6) > 0.7) parts.push("Keep delivery very steady and consistent.");
  if ((b.pauseStrength ?? 0.5) > 0.6) parts.push("Use deliberate, longer pauses between sentences.");
  if ((b.pitch ?? 0.5) > 0.65) parts.push("Use a slightly higher pitch.");
  else if ((b.pitch ?? 0.5) < 0.35) parts.push("Use a slightly lower pitch.");
  return parts.join(" ");
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!body.text?.trim()) return new Response("Missing text", { status: 400 });
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const voice = VOICE_MAP[body.profile ?? "deep"] ?? "onyx";
        const speed = Math.min(1.2, Math.max(0.7, body.speed ?? 1));

        const upstream = await fetch(GATEWAY, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            input: body.text.slice(0, 4000),
            voice,
            response_format: "mp3",
            speed,
            instructions: buildInstructions(body),
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
                : `Voice generation failed (${status}): ${text.slice(0, 200)}`;
          return new Response(JSON.stringify({ error: msg }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const buf = await upstream.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        return Response.json({ audio: `data:audio/mpeg;base64,${b64}` });
      },
    },
  },
});
