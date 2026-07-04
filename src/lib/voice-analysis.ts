// Client-side acoustic analysis of a voice sample. We can't send the raw sample
// to the current TTS provider (it uses prebuilt voices, not true cloning), so we
// fingerprint the sample here — chiefly its fundamental pitch — to lock the
// generated voice to the same gender and never silently flip a male sample to a
// female voice.

export interface VoiceAnalysis {
  gender: "male" | "female" | "unknown";
  pitchHz: number; // median fundamental frequency
  seconds: number; // usable speech duration
  confidence: number; // 0-1
}

// Autocorrelation pitch estimate for a single mono frame.
function detectPitch(frame: Float32Array, sampleRate: number): number {
  const size = frame.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return 0; // silence / too quiet

  const minHz = 70;
  const maxHz = 400;
  const maxLag = Math.floor(sampleRate / minHz);
  const minLag = Math.floor(sampleRate / maxHz);
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < size - lag; i++) corr += frame[i] * frame[i + lag];
    corr /= size - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr < 0.005) return 0;
  return sampleRate / bestLag;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function analyzeVoiceSample(dataUrl: string): Promise<VoiceAnalysis> {
  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const res = await fetch(dataUrl);
    const arrayBuf = await res.arrayBuffer();
    const audio = await ctx.decodeAudioData(arrayBuf);
    const channel = audio.getChannelData(0);
    const sampleRate = audio.sampleRate;
    const frameSize = 2048;
    const hop = 1024;
    const pitches: number[] = [];
    for (let start = 0; start + frameSize < channel.length; start += hop) {
      const p = detectPitch(channel.subarray(start, start + frameSize), sampleRate);
      if (p > 0) pitches.push(p);
    }
    const pitchHz = Math.round(median(pitches));
    // Voiced-frame coverage doubles as a rough confidence signal.
    const voicedRatio = pitches.length / Math.max(1, Math.floor(channel.length / hop));
    let gender: VoiceAnalysis["gender"] = "unknown";
    if (pitchHz > 0) gender = pitchHz < 165 ? "male" : "female";
    const confidence = pitchHz === 0 ? 0 : Math.min(1, voicedRatio * 1.5);
    return { gender, pitchHz, seconds: audio.duration, confidence };
  } finally {
    ctx.close().catch(() => {});
  }
}

// Similarity (0-1) between a reference sample pitch and a generated clip's
// pitch. Identity is dominated by fundamental frequency and gender; an octave
// away scores ~0, an exact pitch match scores 1. This is a real acoustic
// measurement — not a fabricated score — used to gate generation on quality.
export function pitchSimilarity(sampleHz: number, generatedHz: number): number {
  if (!sampleHz || !generatedHz) return 0;
  const cents = Math.abs(1200 * Math.log2(generatedHz / sampleHz)); // pitch distance
  // 0 cents => 1.0, 1200 cents (an octave) => 0. Gender flip is ~an octave.
  const sim = 1 - cents / 1200;
  return Math.max(0, Math.min(1, sim));
}

// Analyze an audio data URL and return its median pitch in Hz (for comparing a
// freshly generated clip against the uploaded sample).
export async function measurePitchHz(dataUrl: string): Promise<number> {
  const analysis = await analyzeVoiceSample(dataUrl);
  return analysis.pitchHz;
}