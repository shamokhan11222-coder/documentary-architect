// Voice generation runs 100% locally in the browser using kokoro-js
// (Kokoro 82M ONNX). Zero paid API calls: no Lovable AI Gateway, no Gemini,
// no OpenRouter, no runtime keys.
import { putImage } from "./images";
import { generateBlockAudio } from "./local-tts/engine";
import { concatSegments, encodeWav, blobToDataUrl, hashText } from "./local-tts/wav";
import { ENGINE_VERSION } from "./local-tts/presets";
import { postProcess } from "./local-tts/dsp";
import { sanitizeNarration } from "./sanitize-narration";
import {
  NEUTRAL_TUNING,
  ZENN_TUNING,
  ZENN_PRESET_ID,
  compensatedKokoroSpeed,
  tuningHash,
  type VoiceTuning,
} from "./local-tts/tuning";
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
  tuningHash?: string;
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

/** Resolve the effective tuning from settings + preset defaults. */
export function resolveTuning(settings: VoiceSettings): VoiceTuning {
  const base: VoiceTuning = (settings.voicePresetId === ZENN_PRESET_ID)
    ? { ...ZENN_TUNING }
    : { ...NEUTRAL_TUNING };
  if (settings.pitchPercent !== undefined) base.pitchPercent = settings.pitchPercent;
  if (settings.brightness !== undefined) base.brightness = settings.brightness;
  if (settings.warmth !== undefined) base.warmth = settings.warmth;
  if (settings.confidence !== undefined) base.confidence = settings.confidence;
  if (settings.energy !== undefined) base.energy = settings.energy;
  if (settings.emotionStrength !== undefined) base.emotion = settings.emotionStrength;
  return base;
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
  const clean = sanitizeNarration(text);
  if (!clean.trim()) throw new Error("Block text is empty after sanitization.");
  const hash = hashText(clean);
  const presetId = settings.voicePresetId ?? "young-smooth-male";
  const targetSpeed = settings.speed || 1.0;
  const tuning = resolveTuning(settings);
  const kokoroSpeed = compensatedKokoroSpeed(targetSpeed, tuning);
  const tHash = tuningHash(tuning);
  const existing = getVoiceMeta(id);
  if (
    existing &&
    existing.textHash === hash &&
    existing.voicePresetId === presetId &&
    existing.speed === targetSpeed &&
    existing.tuningHash === tHash &&
    existing.engineVersion === ENGINE_VERSION
  ) {
    return existing.duration;
  }
  const { segments } = await generateBlockAudio({
    text: clean,
    presetId,
    speed: kokoroSpeed,
    dictionary: settings.dictionary,
    onChunk,
  });
  if (!segments.length) return 0;
  const sentencePause = (settings.sentencePauseMs ?? 120) / 1000;
  const merged = concatSegments(segments, sentencePause);
  const processed = await postProcess(merged, tuning);
  const blob = encodeWav(processed);
  const dataUrl = await blobToDataUrl(blob);
  await putImage(id, dataUrl);
  const duration = processed.samples.length / processed.sampleRate;
  const meta: VoiceBlockMeta = {
    duration,
    sampleRate: processed.sampleRate,
    generatedAt: Date.now(),
    voicePresetId: presetId,
    speed: targetSpeed,
    textHash: hash,
    engineVersion: ENGINE_VERSION,
    tuningHash: tHash,
  };
  writeMeta(id, meta);
  return duration;
}
