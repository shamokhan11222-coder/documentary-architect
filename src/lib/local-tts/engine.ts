// Local Kokoro TTS engine. Runs entirely in the browser via kokoro-js
// (transformers.js + ONNX). Model files are fetched from the Hugging Face CDN
// on first use and cached by the browser (transformers.js Cache Storage +
// kokoro-js voice cache), so subsequent sessions initialize from cache with
// zero network use.
//
// ZERO paid-API calls. No Lovable AI Gateway. No Gemini. No OpenRouter.
import type { VoicePreset } from "./presets";
import { getPreset } from "./presets";
import { preprocess } from "./preprocess";
import type { AudioSegment } from "./wav";

export type EngineStatus =
  | "idle"
  | "downloading"
  | "initializing"
  | "ready"
  | "generating"
  | "error";

export interface EngineState {
  status: EngineStatus;
  progress: number; // 0-1
  currentFile: string | null;
  device: "webgpu" | "wasm" | null;
  fromCache: boolean;
  error: string | null;
}

type Listener = (s: EngineState) => void;

const state: EngineState = {
  status: "idle",
  progress: 0,
  currentFile: null,
  device: null,
  fromCache: false,
  error: null,
};
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l({ ...state });
}

export function subscribeEngine(l: Listener): () => void {
  listeners.add(l);
  l({ ...state });
  return () => listeners.delete(l);
}

export function getEngineState(): EngineState {
  return { ...state };
}

// Support check — we only officially support recent Chrome/Edge/Chromium.
export function browserSupported(): boolean {
  if (typeof window === "undefined") return false;
  // WebAssembly is the hard requirement; WebGPU is optional but preferred.
  return typeof WebAssembly !== "undefined";
}

let ttsPromise: Promise<KokoroLike> | null = null;

interface KokoroLike {
  generate(
    text: string,
    opts: { voice: string; speed?: number },
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

async function detectDevice(): Promise<"webgpu" | "wasm"> {
  try {
    const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (gpu) {
      const adapter = await gpu.requestAdapter();
      if (adapter) return "webgpu";
    }
  } catch {
    /* fall back to wasm */
  }
  return "wasm";
}

/** Load the model. Safe to call more than once — returns the same promise. */
export function loadEngine(): Promise<KokoroLike> {
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    if (!browserSupported()) {
      state.status = "error";
      state.error = "This browser does not support the local voice engine.";
      emit();
      throw new Error(state.error);
    }
    state.status = "downloading";
    state.progress = 0;
    state.error = null;
    state.fromCache = true; // flipped false on first "downloading" progress event
    emit();
    try {
      const device = await detectDevice();
      state.device = device;
      emit();
      const { KokoroTTS } = await import("kokoro-js");
      const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
      const dtype = device === "webgpu" ? "fp32" : "q8";
      const tts = await KokoroTTS.from_pretrained(modelId, {
        dtype,
        device,
        progress_callback: (p: {
          status?: string;
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          if (!p) return;
          if (p.status === "downloading" || p.status === "progress") {
            state.fromCache = false;
            state.status = "downloading";
            if (p.file) state.currentFile = p.file;
            if (typeof p.progress === "number") state.progress = p.progress / 100;
            else if (p.loaded && p.total) state.progress = p.loaded / p.total;
            emit();
          } else if (p.status === "ready" || p.status === "done") {
            state.currentFile = p.file ?? state.currentFile;
            emit();
          } else if (p.status === "initiate") {
            state.status = "downloading";
            state.currentFile = p.file ?? null;
            emit();
          }
        },
      } as never);
      state.status = "initializing";
      state.progress = 1;
      emit();
      // Small yield so the UI can paint "initializing".
      await new Promise((r) => setTimeout(r, 30));
      state.status = "ready";
      emit();
      return tts as KokoroLike;
    } catch (e) {
      ttsPromise = null;
      state.status = "error";
      state.error = e instanceof Error ? e.message : String(e);
      emit();
      throw e;
    }
  })();
  return ttsPromise;
}

export interface GenerateOptions {
  text: string;
  presetId?: string;
  speed?: number;
  dictionary?: { from: string; to: string }[];
  onChunk?: (i: number, total: number) => void;
}

/** Generate one narration block (may internally split into safe chunks). */
export async function generateBlockAudio(
  opts: GenerateOptions,
): Promise<{ segments: AudioSegment[]; preset: VoicePreset; speed: number }> {
  const tts = await loadEngine();
  const preset = getPreset(opts.presetId);
  const speed = clamp(opts.speed ?? preset.defaultSpeed, 0.85, 1.15);
  const chunks = preprocess(opts.text, opts.dictionary ?? []);
  if (!chunks.length) return { segments: [], preset, speed };
  state.status = "generating";
  emit();
  const segments: AudioSegment[] = [];
  try {
    for (let i = 0; i < chunks.length; i++) {
      opts.onChunk?.(i, chunks.length);
      const raw = await tts.generate(chunks[i], { voice: preset.voice, speed });
      segments.push({
        samples: raw.audio,
        sampleRate: raw.sampling_rate,
      });
    }
  } finally {
    state.status = "ready";
    emit();
  }
  return { segments, preset, speed };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}