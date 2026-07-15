// Offline WebAudio post-processing for local TTS. Applies pitch shift +
// documentary-narrator EQ + gentle dynamics to the concatenated Kokoro
// output. All processing is local — no network, no APIs.
import type { AudioSegment } from "./wav";
import type { VoiceTuning } from "./tuning";
import { pitchFactor } from "./tuning";

type OACtor = typeof OfflineAudioContext;

function getOfflineCtor(): OACtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { OfflineAudioContext?: OACtor; webkitOfflineAudioContext?: OACtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

/**
 * Pitch-shift + tone-shape + dynamics. Duration shortens by the pitch factor
 * because we resample via `playbackRate`; callers should pre-compensate
 * Kokoro's own speed so the final duration matches the user's target speed
 * (see `compensatedKokoroSpeed`).
 */
export async function postProcess(
  seg: AudioSegment,
  tuning: VoiceTuning,
): Promise<AudioSegment> {
  const OACtor = getOfflineCtor();
  if (!OACtor || !seg.samples.length) return seg;

  const pitch = pitchFactor(tuning);
  const inLen = seg.samples.length;
  // playbackRate = pitch → output is inLen / pitch samples long.
  const outLen = Math.max(1, Math.ceil(inLen / pitch));
  const ctx = new OACtor(1, outLen, seg.sampleRate);

  const inputBuffer = ctx.createBuffer(1, inLen, seg.sampleRate);
  inputBuffer.getChannelData(0).set(seg.samples);

  const src = ctx.createBufferSource();
  src.buffer = inputBuffer;
  src.playbackRate.value = pitch;

  // Warmth: gentle low-shelf around 250Hz. -1..+1 → -4..+4 dB.
  const warmth = ctx.createBiquadFilter();
  warmth.type = "lowshelf";
  warmth.frequency.value = 250;
  warmth.gain.value = tuning.warmth * 4;

  // Presence / confidence: mid peak around 1.8kHz. 0..1 → 0..4 dB.
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 1800;
  presence.Q.value = 1.0;
  presence.gain.value = tuning.confidence * 4;

  // Brightness: high-shelf around 4kHz. -1..+1 → -6..+6 dB.
  const bright = ctx.createBiquadFilter();
  bright.type = "highshelf";
  bright.frequency.value = 4000;
  bright.gain.value = tuning.brightness * 6;

  // Low-cut to keep narration clean (removes DC/thumb rumble).
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 85;

  // Dynamics: energy raises ratio + lowers threshold; emotion softens knee.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22 - tuning.energy * 6;   // -22..-28 dB
  comp.knee.value = 12 + tuning.emotion * 12;       // 12..24 dB
  comp.ratio.value = 2.5 + tuning.energy * 2.5;     // 2.5..5
  comp.attack.value = 0.006;
  comp.release.value = 0.16;

  // Makeup gain scales with energy to keep perceived loudness up.
  const makeup = ctx.createGain();
  makeup.gain.value = 1.0 + tuning.energy * 0.25;

  src.connect(highpass);
  highpass.connect(warmth);
  warmth.connect(presence);
  presence.connect(bright);
  bright.connect(comp);
  comp.connect(makeup);
  makeup.connect(ctx.destination);

  src.start(0);
  const rendered = await ctx.startRendering();
  const out = new Float32Array(rendered.length);
  rendered.copyFromChannel(out, 0);
  // Soft-clip guard.
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    out[i] = x > 0.98 ? 0.98 : x < -0.98 ? -0.98 : x;
  }
  return { samples: out, sampleRate: seg.sampleRate };
}