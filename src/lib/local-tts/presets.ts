// Voice presets exposed in the Voice Studio UI. Each maps to a real Kokoro
// voice id that ships with `onnx-community/Kokoro-82M-v1.0-ONNX`. Do NOT list
// voices the model does not actually support — no fake cloning controls.
export interface VoicePreset {
  id: string;
  label: string;
  desc: string;
  voice: string; // kokoro voice id
  gender: "male" | "female";
  defaultSpeed: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "young-confident-male",
    label: "Young Confident Male",
    desc: "Young, light, confident American male documentary narrator — default",
    voice: "am_michael",
    gender: "male",
    defaultSpeed: 1.06,
  },
  {
    id: "zenn-clone",
    label: "Zenn Clone",
    desc: "Confident young male documentary narrator (post-tuned)",
    voice: "am_puck",
    gender: "male",
    defaultSpeed: 1.10,
  },
  {
    id: "calm-educational-male",
    label: "Calm Educational Male",
    desc: "Clear, measured, explanatory",
    voice: "am_michael",
    gender: "male",
    defaultSpeed: 0.98,
  },
  {
    id: "friendly-storyteller-male",
    label: "Friendly Storyteller Male",
    desc: "Engaging, expressive, conversational",
    voice: "am_fenrir",
    gender: "male",
    defaultSpeed: 1.0,
  },
  {
    id: "soft-documentary-female",
    label: "Soft Documentary Female",
    desc: "Smooth, natural narration",
    voice: "af_nicole",
    gender: "female",
    defaultSpeed: 1.0,
  },
  {
    id: "clear-educational-female",
    label: "Clear Educational Female",
    desc: "Bright, articulate, teacher-like",
    voice: "af_heart",
    gender: "female",
    defaultSpeed: 1.0,
  },
];

export const DEFAULT_PRESET_ID = "young-confident-male";

export function getPreset(id: string | undefined | null): VoicePreset {
  return VOICE_PRESETS.find((p) => p.id === id) ?? VOICE_PRESETS[0];
}

export const ENGINE_VERSION = "kokoro-82m-v1.0-onnx";