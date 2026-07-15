// Voice-tuning model. Deterministic knobs applied after Kokoro synthesis so
// the underlying local engine is never replaced — we only reshape the
// resulting audio (pitch shift + EQ + dynamics) and adjust Kokoro's own
// speed to keep the target speaking rate constant.
export interface VoiceTuning {
  /** -20..+30 percent. +12 = +12%. */
  pitchPercent: number;
  /** -1..+1. */
  brightness: number;
  /** -1..+1. */
  warmth: number;
  /** 0..1 — presence / assertive mid boost. */
  confidence: number;
  /** 0..1 — dynamics: pushes level and shortens quiet moments. */
  energy: number;
  /** 0..1 — prosody variance (subtle compression + gentle limiting). */
  emotion: number;
}

export const NEUTRAL_TUNING: VoiceTuning = {
  pitchPercent: 0,
  brightness: 0,
  warmth: 0,
  confidence: 0,
  energy: 0.5,
  emotion: 0.5,
};

// The requested "Zenn" documentary-narrator profile.
export const ZENN_TUNING: VoiceTuning = {
  pitchPercent: 12,
  brightness: 0.15,
  warmth: 0.35,
  confidence: 1.0,
  energy: 0.85,
  emotion: 0.65,
};

export const ZENN_SPEED = 1.10;
export const ZENN_PRESET_ID = "zenn-clone";

/** Deterministic hash so cached blocks invalidate when tuning changes. */
export function tuningHash(t: VoiceTuning): string {
  const s = [
    t.pitchPercent, t.brightness, t.warmth, t.confidence, t.energy, t.emotion,
  ].map((n) => Math.round(n * 1000)).join(":");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Pitch factor. +12% → 1.12. */
export function pitchFactor(t: VoiceTuning): number {
  return Math.max(0.5, Math.min(1.5, 1 + (t.pitchPercent ?? 0) / 100));
}

/**
 * Kokoro's own speed must be pre-compensated so the pitch-shift resample
 * (playbackRate = pitch) yields the final target speed unchanged.
 * Kokoro clamps speed to 0.85..1.15 internally; we clamp here to stay safe.
 */
export function compensatedKokoroSpeed(targetSpeed: number, tuning: VoiceTuning): number {
  const p = pitchFactor(tuning);
  const raw = targetSpeed / p;
  return Math.max(0.85, Math.min(1.15, raw));
}