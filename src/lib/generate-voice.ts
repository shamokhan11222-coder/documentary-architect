// Client helper for narration generation. Calls the TTS route, stores the mp3
// in IndexedDB, and measures the real audio duration.
import { putImage } from "./images";
import { ttsProviderPayload } from "./provider";
import { enqueueAi } from "./ai-queue";
import { getVoiceProfile } from "./production";
import type { VoiceSettings } from "./types";

export const voiceBlockId = (topicId: string, index: number) => `voice:${topicId}:${index}`;

// Hard timeout so a slow/unresponsive voice provider can never hang forever.
export const VOICE_TIMEOUT_MS = 120_000;
const VOICE_TIMEOUT_MESSAGE = "Request timed out. Provider may be slow or unavailable.";

function applyDictionary(text: string, dict: VoiceSettings["dictionary"]): string {
  let out = text;
  for (const d of dict) {
    if (!d.from.trim()) continue;
    out = out.replace(new RegExp(`\\b${escapeRe(d.from)}\\b`, "gi"), d.to);
  }
  return out;
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function measureDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => resolve(0);
    audio.src = dataUrl;
  });
}

export async function generateVoiceBlock(
  topicId: string,
  index: number,
  text: string,
  settings: VoiceSettings,
): Promise<number> {
  const spoken = applyDictionary(text, settings.dictionary);

  // If a cloned voice is selected, it MUST drive synthesis — never silently
  // fall back to a default (often female) prebuilt voice.
  let clone: { id: string; name: string; gender: string; pitchHz?: number } | undefined;
  if (settings.clonedProfileId) {
    const profile = getVoiceProfile(settings.clonedProfileId);
    if (!profile) throw new Error("Selected voice clone could not be used.");
    if (profile.status && profile.status !== "ready") {
      throw new Error("Voice clone is still processing.");
    }
    if (!profile.sampleAudioId && !profile.sampleAudio) {
      throw new Error("Selected voice clone could not be used.");
    }
    clone = {
      id: profile.id,
      name: profile.name,
      gender: profile.gender ?? "unknown",
      pitchHz: profile.pitchHz,
    };
    console.info("[voice] using cloned voice", clone);
  }

  const data = await enqueueAi(async () => {
    const provider = ttsProviderPayload();
    console.info("[voice] request started", { provider: "lovable-gateway", model: "openai/gpt-4o-mini-tts" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VOICE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: spoken,
          profile: settings.profile,
          speed: settings.speed,
          stability: settings.stability,
          emotion: settings.emotion,
          pauseStrength: settings.pauseStrength,
          pitch: settings.pitch,
          age: settings.age,
          energy: settings.energy,
          style: settings.style,
          provider,
          clone,
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        console.error("[voice] request failed", { error: VOICE_TIMEOUT_MESSAGE });
        throw new Error(VOICE_TIMEOUT_MESSAGE);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let msg = `Voice generation failed (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      console.error("[voice] request failed", { status: res.status, error: msg });
      throw new Error(res.status === 429 ? `429 ${msg}` : msg);
    }
    const json = (await res.json()) as { audio?: string };
    if (!json?.audio) throw new Error("Voice generation returned no audio.");
    console.info("[voice] response received");
    return json as { audio: string };
  }, "Voice");
  await putImage(voiceBlockId(topicId, index), data.audio);
  return measureDuration(data.audio);
}
