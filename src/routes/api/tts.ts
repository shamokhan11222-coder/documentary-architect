import { createFileRoute } from "@tanstack/react-router";

// Text-to-speech for the Voice Studio. Returns base64 mp3 so the client can
// store each paragraph's narration block in IndexedDB and measure duration.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "openai/gpt-4o-mini-tts";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";

const VOICE_MAP: Record<string, string> = {
  deep: "onyx",
  calm: "sage",
  storyteller: "fable",
  educational: "alloy",
  cinematic: "ash",
};

// Gemini prebuilt voice names mapped to our narrator profiles.
const GEMINI_VOICE_MAP: Record<string, string> = {
  deep: "Charon",
  calm: "Kore",
  storyteller: "Aoede",
  educational: "Puck",
  cinematic: "Fenrir",
};

type Body = {
  text?: string;
  profile?: string;
  speed?: number;
  stability?: number;
  emotion?: number;
  pauseStrength?: number;
  pitch?: number;
  provider?: { name?: string; apiKey?: string; ttsModel?: string; fallback?: boolean };
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

// Wrap raw 16-bit PCM (Gemini returns L16 @ 24kHz mono) in a WAV container so
// browsers can play and measure it.
function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Narrate with the user's own Google Gemini key (no Lovable AI involved).
async function ttsWithGemini(body: Body): Promise<Response> {
  const provider = body.provider!;
  const model = provider.ttsModel || "gemini-2.5-flash-preview-tts";
  const voice = GEMINI_VOICE_MAP[body.profile ?? "deep"] ?? "Charon";
  const prompt = `${buildInstructions(body)}\n\nSay: ${body.text!.slice(0, 4000)}`;
  const upstream = await fetch(
    `${GOOGLE}/${model}:generateContent?key=${encodeURIComponent(provider.apiKey ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
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
          : `Gemini voice generation failed (${status}): ${text.slice(0, 200)}`;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
  }
  const data = await upstream.json();
  const part = (data?.candidates?.[0]?.content?.parts ?? []).find(
    (p: { inlineData?: { data?: string } }) => p?.inlineData?.data,
  );
  const b64 = part?.inlineData?.data;
  if (!b64)
    return new Response(JSON.stringify({ error: "Gemini returned no audio." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType ?? "");
  const wav = pcmToWav(Buffer.from(b64, "base64"), rateMatch ? Number(rateMatch[1]) : 24000);
  return Response.json({ audio: `data:audio/wav;base64,${wav.toString("base64")}` });
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        if (!body.text?.trim()) return new Response("Missing text", { status: 400 });

        // Active Gemini provider → use the user's key directly.
        if (body.provider?.name === "gemini" && body.provider.apiKey) {
          const r = await ttsWithGemini(body);
          // On failure, fall through to built-in AI only if fallback is enabled.
          if (r.ok || !body.provider.fallback) return r;
        }

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
