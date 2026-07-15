// Phase 4 — Dynamic Scene Calculator.
//
// Computes storyboard scene counts from *actual* script duration instead of
// the previous fixed one-sentence-one-image rule (which for an 11 min script
// only produced ~66 scenes because a single AI call truncated long
// storyboards). Everything here is pure — no AI calls, no network. The
// storyboard route uses these helpers to derive target counts, chunk the
// script into batches, and validate the merged result.

import type { VisualScene } from "./types";

export type PacingMode = "auto" | "fast" | "recommended" | "balanced" | "slow" | "custom";

export interface PacingPreset {
  id: PacingMode;
  label: string;
  seconds: number; // average scene duration
  description: string;
}

export const PACING_PRESETS: PacingPreset[] = [
  { id: "auto", label: "Auto", seconds: 3, description: "Adapts to narration — 2–5s per scene" },
  { id: "fast", label: "Fast", seconds: 2.5, description: "~2.5s per scene" },
  { id: "recommended", label: "Recommended", seconds: 3, description: "~3s per scene" },
  { id: "balanced", label: "Balanced", seconds: 3.5, description: "~3.5s per scene" },
  { id: "slow", label: "Slow", seconds: 4, description: "~4s per scene" },
  { id: "custom", label: "Custom", seconds: 3, description: "Choose 2–6s per scene" },
];

export type SpeechRate = "slow" | "natural" | "fast" | "custom";

export const WPM_PRESETS: Record<Exclude<SpeechRate, "custom">, number> = {
  slow: 125,
  natural: 145,
  fast: 165,
};

export const DEFAULT_WPM = 145;

export const MIN_SCENE_SECONDS = 2;
export const MAX_SCENE_SECONDS = 6;
export const MIN_SCENE_COUNT = 10;
export const MAX_SCENE_COUNT = 400;

/** Scenes per single AI batch call. Keeps each request small enough that
 *  the model can emit valid JSON without truncating. */
export const SCENES_PER_BATCH = 50;

export function wordCount(script: string): number {
  return (script.match(/\S+/g) ?? []).length;
}

export function estimateSecondsFromWords(script: string, wpm: number): number {
  const words = wordCount(script);
  const safeWpm = Math.max(60, Math.min(240, Math.round(wpm)));
  return (words / safeWpm) * 60;
}

export interface DurationSource {
  seconds: number;
  source: "voice" | "manual" | "words";
}

/** Priority: real voice duration → user-entered target minutes → script/WPM. */
export function resolveScriptDuration(opts: {
  script: string;
  wpm: number;
  voiceRealSeconds?: number | null;
  manualMinutes?: number | null;
}): DurationSource {
  if (opts.voiceRealSeconds && opts.voiceRealSeconds > 5) {
    return { seconds: opts.voiceRealSeconds, source: "voice" };
  }
  if (opts.manualMinutes && opts.manualMinutes > 0) {
    return { seconds: opts.manualMinutes * 60, source: "manual" };
  }
  return { seconds: estimateSecondsFromWords(opts.script, opts.wpm), source: "words" };
}

export function clampSceneSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 3;
  return Math.max(MIN_SCENE_SECONDS, Math.min(MAX_SCENE_SECONDS, seconds));
}

/** targetSceneCount = totalNarrationSeconds / avgSceneSeconds, clamped to
 *  [MIN_SCENE_COUNT, MAX_SCENE_COUNT]. */
export function computeTargetSceneCount(totalSeconds: number, avgSceneSeconds: number): number {
  const avg = clampSceneSeconds(avgSceneSeconds);
  const raw = Math.round(totalSeconds / avg);
  return Math.max(MIN_SCENE_COUNT, Math.min(MAX_SCENE_COUNT, raw));
}

/** Split the script into roughly-equal batches so each AI call plans about
 *  SCENES_PER_BATCH scenes. Preserves sentence boundaries. */
export function splitScriptForBatches(script: string, targetScenes: number): string[] {
  const clean = script.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const batches = Math.max(1, Math.ceil(targetScenes / SCENES_PER_BATCH));
  if (batches === 1) return [clean];

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length <= batches) return [clean];

  const perBatch = Math.ceil(sentences.length / batches);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += perBatch) {
    out.push(sentences.slice(i, i + perBatch).join(" "));
  }
  return out;
}

/** Local deterministic fallback when the AI returns nothing usable: chop the
 *  script into `target` visual beats by sentence + clause. */
export function localScenesFromScript(script: string, target: number): VisualScene[] {
  const clean = script.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    const parts = sentence
      .split(/,|;|:| — | – | and | then | while | but /i)
      .map((p) => p.trim())
      .filter((p) => p.split(/\s+/).length >= 3);
    if (parts.length >= 2) chunks.push(...parts);
    else chunks.push(sentence);
  }

  // Grow or shrink to hit target.
  while (chunks.length < target && chunks.length > 0) {
    // Split the longest chunk in half.
    let idx = 0;
    for (let i = 1; i < chunks.length; i++) if (chunks[i].length > chunks[idx].length) idx = i;
    const longest = chunks[idx];
    const words = longest.split(/\s+/);
    if (words.length < 6) break;
    const mid = Math.floor(words.length / 2);
    chunks.splice(idx, 1, words.slice(0, mid).join(" "), words.slice(mid).join(" "));
  }
  while (chunks.length > target && chunks.length > 1) {
    // Merge two shortest adjacent chunks.
    let idx = 0;
    for (let i = 1; i < chunks.length - 1; i++) {
      if (chunks[i].length + chunks[i + 1].length < chunks[idx].length + chunks[idx + 1].length) idx = i;
    }
    chunks.splice(idx, 2, chunks[idx] + " " + chunks[idx + 1]);
  }

  return chunks.map((line, i) => ({
    sceneNumber: i + 1,
    voiceoverLine: line,
    visualDescription: line,
    mainSubject: "",
    background: "",
    cameraShot: "medium shot",
    emotion: "neutral",
    objectsNeeded: [],
    sceneType: "abstract concept" as const,
    visualDifficulty: "medium",
    notes: "Auto-generated from script.",
  }));
}

/** Merge batched scene arrays into one continuous, sequentially-numbered
 *  storyboard. Drops empty scenes, deduplicates identical adjacent visual
 *  descriptions, and renumbers 1..N. */
export function mergeAndRenumber(batches: VisualScene[][]): VisualScene[] {
  const flat: VisualScene[] = [];
  for (const b of batches) if (Array.isArray(b)) for (const s of b) if (s) flat.push(s);
  const cleaned: VisualScene[] = [];
  for (const s of flat) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.visualDescription && prev.visualDescription === s.visualDescription) continue;
    cleaned.push(s);
  }
  return cleaned.map((s, i) => ({ ...s, sceneNumber: i + 1 }));
}

export interface TimedScene extends VisualScene {
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
}

/** Distribute the total narration duration across scenes. Auto mode weights
 *  by narration-line length so diagrams / long lines get more time (2–5s);
 *  fixed pacing modes use the preset average. */
export function assignSceneTimings(
  scenes: VisualScene[],
  totalSeconds: number,
  mode: PacingMode,
  avgSeconds: number,
): TimedScene[] {
  if (!scenes.length) return [];
  const avg = clampSceneSeconds(avgSeconds);
  const weights = scenes.map((s) => {
    if (mode !== "auto") return 1;
    const line = (s.voiceoverLine || s.visualDescription || "").trim();
    const words = line.split(/\s+/).filter(Boolean).length || 1;
    const isDiagram = /diagram|infograph|compar|chart|timeline/i.test(s.sceneType + " " + s.visualDescription);
    const base = Math.max(0.6, Math.min(1.6, words / 8));
    return isDiagram ? Math.min(1.8, base * 1.4) : base;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const target = mode === "auto" ? totalSeconds : scenes.length * avg;
  const raw = weights.map((w) => (w / weightSum) * target);
  const clamped = raw.map((d) => Math.max(MIN_SCENE_SECONDS, Math.min(mode === "auto" ? 5 : 4, d)));
  let start = 0;
  return scenes.map((s, i) => {
    const duration = Math.round(clamped[i] * 10) / 10;
    const startSeconds = Math.round(start * 10) / 10;
    start += duration;
    return { ...s, durationSeconds: duration, startSeconds, endSeconds: Math.round(start * 10) / 10 };
  });
}

export interface ScenePlanValidation {
  ok: boolean;
  issues: string[];
  totalScenes: number;
  totalDuration: number;
  targetDuration: number;
}

export function validateScenePlan(timed: TimedScene[], targetSeconds: number): ScenePlanValidation {
  const issues: string[] = [];
  const seen = new Set<number>();
  for (const t of timed) {
    if (seen.has(t.sceneNumber)) issues.push(`Duplicate scene ${t.sceneNumber}`);
    seen.add(t.sceneNumber);
    if (t.durationSeconds < MIN_SCENE_SECONDS - 0.01) issues.push(`Scene ${t.sceneNumber} < ${MIN_SCENE_SECONDS}s`);
    if (t.durationSeconds > 5.01) issues.push(`Scene ${t.sceneNumber} > 5s`);
    if (!t.voiceoverLine?.trim()) issues.push(`Scene ${t.sceneNumber} missing narration`);
  }
  const total = timed.reduce((a, s) => a + s.durationSeconds, 0);
  if (Math.abs(total - targetSeconds) > 5) {
    issues.push(`Total duration ${total.toFixed(1)}s off target ${targetSeconds.toFixed(1)}s`);
  }
  return {
    ok: issues.length === 0,
    issues,
    totalScenes: timed.length,
    totalDuration: total,
    targetDuration: targetSeconds,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function pacingLabel(mode: PacingMode, custom: number): string {
  const p = PACING_PRESETS.find((x) => x.id === mode);
  if (!p) return "Recommended — 3s";
  if (mode === "custom") return `Custom — ${custom.toFixed(1)}s`;
  if (mode === "auto") return "Auto — adaptive";
  return `${p.label} — ${p.seconds}s`;
}