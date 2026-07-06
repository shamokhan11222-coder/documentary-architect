import { createFileRoute } from "@tanstack/react-router";
import { GEMINI_TTS_MODEL_DEFAULT_FULL, normalizeGeminiModel } from "../../lib/gemini-model";

// Text-to-speech for the Voice Studio. Returns base64 mp3 so the client can
// store each paragraph's narration block in IndexedDB and measure duration.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "openai/gpt-4o-mini-tts";

const VOICE_MAP: Record<string, string> = {
  deep: "onyx",
  calm: "ash", // natural, warm — the default persona (NOT deep/bass)
  storyteller: "fable",
  educational: "alloy",
  cinematic: "ash",
};

// Natural male OpenAI voices ordered by how youthful/light they sound. We pick
// by the sample's measured pitch so a young ~130 Hz male never gets the deep
// bass "onyx" voice. We NEVER go lower than the sample's own register.
function naturalMaleVoiceForPitch(pitchHz?: number): string {
  if (!pitchHz) return "ash"; // natural young-adult male default
  if (pitchHz >= 135) return "echo"; // brighter/younger
  if (pitchHz >= 115) return "ash"; // natural mid
  return "onyx"; // genuinely deep sample only
}
function naturalFemaleVoiceForPitch(pitchHz?: number): string {
  if (!pitchHz) return "shimmer";
  return pitchHz >= 210 ? "nova" : "shimmer";
}

// Gemini prebuilt voice names mapped to our narrator profiles.
const GEMINI_VOICE_MAP: Record<string, string> = {
  deep: "Charon",
  calm: "Kore",
  storyteller: "Aoede",
  educational: "Puck",
  cinematic: "Fenrir",
};

// Gender-locked Gemini prebuilt voices. When a cloned sample is identified as
// male or female, generation MUST stay in that gender — we never fall back to a
// voice of the opposite gender.
const GEMINI_MALE_VOICES: Record<string, string> = {
  deep: "Charon",
  calm: "Iapetus",
  storyteller: "Puck",
  educational: "Puck",
  cinematic: "Fenrir",
};
const GEMINI_FEMALE_VOICES: Record<string, string> = {
  deep: "Kore",
  calm: "Kore",
  storyteller: "Aoede",
  educational: "Leda",
  cinematic: "Zephyr",
};

type Body = {
  text?: string;
  profile?: string;
  speed?: number;
  stability?: number;
  emotion?: number;
  pauseStrength?: number;
  pitch?: number;
  age?: number;
  energy?: number;
  style?: string;
  provider?: { name?: string; apiKey?: string; ttsModel?: string; fallback?: boolean };
  clone?: { id?: string; name?: string; gender?: string; pitchHz?: number };
};

function buildInstructions(b: Body): string {
  const parts: string[] = [];
  // Default identity: young adult male, calm, friendly, natural — modern
  // YouTube documentary creator. This is the base persona for a clone match.
  const isClone = !!b.clone;
  if (isClone) {
    parts.push(
      "Reproduce the speaker's natural voice identity as closely as possible: keep their apparent age, energy and youthful timbre.",
    );
  }
  parts.push(
    "Speak as a young-adult, natural, conversational documentary narrator, similar to modern YouTube creators.",
  );
  parts.push("Calm, friendly, warm and clear.");
  // Hard constraints requested by the user.
  parts.push("Do NOT deepen the voice. Do NOT add bass or a movie-trailer effect. Keep the pitch natural and youthful.");

  // Age: lower value = younger. Never make the voice sound old/deep.
  const age = b.age ?? 0.3;
  if (age < 0.35) parts.push("Sound young and fresh.");
  else if (age > 0.65) parts.push("Sound mature but never elderly or overly deep.");

  // Energy.
  const energy = b.energy ?? 0.5;
  if (energy > 0.65) parts.push("Bring lively, upbeat energy and momentum.");
  else if (energy < 0.35) parts.push("Keep the delivery relaxed and easy-going.");

  // Style.
  switch (b.style) {
    case "friendly":
      parts.push("Casual, friendly and approachable, like talking to a friend.");
      break;
    case "narrative":
      parts.push("Engaging storyteller cadence, natural and expressive.");
      break;
    case "educational":
      parts.push("Clear, explanatory teaching tone.");
      break;
    case "energetic":
      parts.push("Punchy, energetic creator delivery.");
      break;
    default:
      parts.push("Modern documentary narration style.");
  }

  if ((b.emotion ?? 0) > 0.6) parts.push("Use noticeable emotional expression.");
  else if ((b.emotion ?? 0) < 0.3) parts.push("Keep emotion subtle and even.");
  if ((b.stability ?? 0.6) > 0.7) parts.push("Keep delivery very steady and consistent.");
  if ((b.pauseStrength ?? 0.5) > 0.6) parts.push("Use deliberate, longer pauses between sentences.");
  // Pitch: allow raising toward the sample, never lowering below natural.
  if ((b.pitch ?? 0.5) > 0.6) parts.push("Use a slightly higher, brighter pitch.");
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
  const model = normalizeGeminiModel(provider.ttsModel) || GEMINI_TTS_MODEL_DEFAULT_FULL;
  console.log(`Final Gemini model sent: ${model}`);
  // A selected clone locks the gender: a male sample never yields a female
  // voice and vice-versa. Falls back to the profile map only when no clone.
  const profileKey = body.profile ?? "deep";
  let voice: string;
  if (body.clone?.gender === "male") {
    voice = GEMINI_MALE_VOICES[profileKey] ?? "Charon";
  } else if (body.clone?.gender === "female") {
    voice = GEMINI_FEMALE_VOICES[profileKey] ?? "Kore";
  } else {
    voice = GEMINI_VOICE_MAP[profileKey] ?? "Charon";
  }
  const prompt = `${buildInstructions(body)}\n\nSay: ${body.text!.slice(0, 4000)}`;
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(provider.apiKey ?? "")}`,
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
        // Keep built-in AI narration consistent with a selected clone. Match the
        // sample's PITCH, not just gender, so a natural young male never gets the
        // deep bass "onyx" voice.
        const lockedVoice =
          body.clone?.gender === "male"
            ? naturalMaleVoiceForPitch(body.clone?.pitchHz)
            : body.clone?.gender === "female"
              ? naturalFemaleVoiceForPitch(body.clone?.pitchHz)
              : body.clone
                ? "ash"
                : voice;
        const speed = Math.min(1.2, Math.max(0.7, body.speed ?? 1));

        const upstream = await fetch(GATEWAY, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            input: body.text.slice(0, 4000),
            voice: lockedVoice,
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
