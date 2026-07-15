// Voice generation runs 100% locally in the browser using kokoro-js
// (Kokoro 82M ONNX). Zero paid API calls: no Lovable AI Gateway, no Gemini,
// no OpenRouter, no runtime keys.
import { putImage } from "./images";
import { generateBlockAudio } from "./local-tts/engine";
import { concatSegments, encodeWav, blobToDataUrl, hashText } from "./local-tts/wav";
import { ENGINE_VERSION } from "./local-tts/presets";
import type { VoiceSettings } from "./types";

export const voiceBlockId = (topicId: string, index: number) =>
  `voice:${topicId}:${index}`;

export const VOICE_GENERATION_ENABLED = true;
export const VOICE_DISABLED_MESSAGE =
  "Load the free local voice engine to start generating.";

export const VOICE_TIMEOUT_MS = 120_000;

export interface VoiceBlockMeta {
  duration: number;
  sampleRate: number;
  generatedAt: number;
  voicePresetId: string;
  speed: number;
  textHash: string;
  engineVersion: string;
}

const META_KEY = "docos.voiceMeta";

function readMetaMap(): Record<string, VoiceBlockMeta> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getVoiceMeta(id: string): VoiceBlockMeta | null {
  return readMetaMap()[id] ?? null;
}

function writeMeta(id: string, meta: VoiceBlockMeta) {
  const all = readMetaMap();
  all[id] = meta;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

/** Generate one voice block, store the WAV in IndexedDB, return duration (s). */
export async function generateVoiceBlock(
  topicId: string,
  index: number,
  text: string,
  settings: VoiceSettings,
  onChunk?: (i: number, total: number) => void,
): Promise<number> {
  const id = voiceBlockId(topicId, index);
  const hash = hashText(text);
  const presetId = settings.voicePresetId ?? "young-smooth-male";
  const speed = settings.speed || 1.0;
  const existing = getVoiceMeta(id);
  if (
    existing &&
    existing.textHash === hash &&
    existing.voicePresetId === presetId &&
    existing.speed === speed &&
    existing.engineVersion === ENGINE_VERSION
  ) {
    return existing.duration;
  }
  const { segments } = await generateBlockAudio({
    text,
    presetId,
    speed,
    dictionary: settings.dictionary,
    onChunk,
  });
  if (!segments.length) return 0;
  const sentencePause = (settings.sentencePauseMs ?? 120) / 1000;
  const merged = concatSegments(segments, sentencePause);
  const blob = encodeWav(merged);
  const dataUrl = await blobToDataUrl(blob);
  await putImage(id, dataUrl);
  const duration = merged.samples.length / merged.sampleRate;
  const meta: VoiceBlockMeta = {
    duration,
    sampleRate: merged.sampleRate,
    generatedAt: Date.now(),
    voicePresetId: presetId,
    speed,
    textHash: hash,
    engineVersion: ENGINE_VERSION,
  };
  writeMeta(id, meta);
  return duration;
}
