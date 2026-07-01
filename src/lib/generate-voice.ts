// Client helper for narration generation. Calls the TTS route, stores the mp3
// in IndexedDB, and measures the real audio duration.
import { putImage } from "./images";
import type { VoiceSettings } from "./types";

export const voiceBlockId = (topicId: string, index: number) => `voice:${topicId}:${index}`;

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
  const res = await fetch("/api/tts", {
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
    }),
  });
  if (!res.ok) {
    let msg = `Voice generation failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { audio: string };
  await putImage(voiceBlockId(topicId, index), data.audio);
  return measureDuration(data.audio);
}
