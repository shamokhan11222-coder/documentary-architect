// Local browser TTS using kokoro-js (ONNX/WASM/WebGPU). No server calls,
// no Lovable AI Gateway, no Gemini, no credits. Model is downloaded from
// Hugging Face once and cached by the browser.
import { toast } from "sonner";
import { putImage } from "./images";
import { enqueueAi } from "./ai-queue";
import { getVoiceProfile } from "./production";
import type { VoiceSettings } from "./types";

export const voiceBlockId = (topicId: string, index: number) => `voice:${topicId}:${index}`;

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Voice mapping for our narrator profiles. Defaults tuned for a calm,
// young-adult male documentary narrator (no deep bass).
const MALE_VOICES: Record<string, string> = {
  deep: "am_michael",
  calm: "am_adam",
  storyteller: "am_michael",
  educational: "am_adam",
  cinematic: "am_michael",
};
const FEMALE_VOICES: Record<string, string> = {
  deep: "af_nicole",
  calm: "af_heart",
  storyteller: "af_bella",
  educational: "af_sarah",
  cinematic: "af_nicole",
};

type Kokoro = {
  generate: (
    text: string,
    opts: { voice: string; speed?: number },
  ) => Promise<{ toBlob: () => Blob; toWav: () => ArrayBuffer; sampling_rate: number }>;
};

let modelPromise: Promise<Kokoro> | null = null;

async function loadModel(): Promise<Kokoro> {
  if (modelPromise) return modelPromise;
  const toastId = toast.loading("Loading free local voice model…");
  modelPromise = (async () => {
    try {
      const mod = await import("kokoro-js");
      const device = (await hasWebGPU()) ? "webgpu" : "wasm";
      const dtype = device === "webgpu" ? "fp32" : "q8";
      const tts = await mod.KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: dtype as "fp32" | "q8",
        device: device as "webgpu" | "wasm",
      });
      toast.success("Local voice model ready", { id: toastId });
      return tts as unknown as Kokoro;
    } catch (e) {
      toast.error("Local voice model could not load. Retry the download.", { id: toastId });
      modelPromise = null;
      throw e;
    }
  })();
  return modelPromise;
}

async function hasWebGPU(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Failed to encode audio"));
    r.readAsDataURL(blob);
  });
}

function measureDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => resolve(0);
    audio.src = dataUrl;
  });
}

function pickVoice(settings: VoiceSettings, cloneGender?: string): string {
  const profileKey = settings.profile ?? "calm";
  const gender = cloneGender ?? "male"; // default persona: young adult male
  const table = gender === "female" ? FEMALE_VOICES : MALE_VOICES;
  return table[profileKey] ?? "am_michael";
}

export async function generateVoiceBlock(
  topicId: string,
  index: number,
  text: string,
  settings: VoiceSettings,
): Promise<number> {
  const spoken = applyDictionary(text, settings.dictionary);

  let cloneGender: string | undefined;
  if (settings.clonedProfileId) {
    const profile = getVoiceProfile(settings.clonedProfileId);
    if (!profile) throw new Error("Selected voice clone could not be used.");
    if (profile.status && profile.status !== "ready") {
      throw new Error("Voice clone is still processing.");
    }
    cloneGender = profile.gender;
  }

  const dataUrl = await enqueueAi(async () => {
    const tts = await loadModel();
    const voice = pickVoice(settings, cloneGender);
    const speed = Math.min(1.5, Math.max(0.7, settings.speed ?? 1));
    try {
      const audio = await tts.generate(spoken.slice(0, 4000), { voice, speed });
      const blob = audio.toBlob();
      return await blobToDataUrl(blob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Voice generation failed for this block. Your project data is safe. (${msg})`);
    }
  }, "Voice", { retryRateLimits: false });

  await putImage(voiceBlockId(topicId, index), dataUrl);
  return measureDuration(dataUrl);
}

// Kept for backwards compatibility — never used by the local path.
export const VOICE_TIMEOUT_MS = 120_000;
