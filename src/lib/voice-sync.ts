// Phase 7 — Voice-to-Image Sync Engine.
// 100% local, deterministic mapping between voice blocks and storyboard scenes.
// Never calls any AI provider.
import { useSyncExternalStore } from "react";

import type { VisualScene, VoiceProject, VoiceBlock } from "./types";
import { estimateSeconds } from "./production";
import { getVoiceMeta, voiceBlockId } from "./generate-voice";

export const SYNC_VERSION = 1;

// ---------------- Model ----------------

export interface SyncVoiceBlock {
  blockIndex: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  audioId: string;
}

export interface SyncScene {
  sceneId: string;
  sceneNumber: number;
  start: number;
  end: number;
  duration: number;
  voiceBlockStart: number;
  voiceBlockEnd: number;
  imageId: string;
  narrationText: string;
  locked?: boolean;
  missingImage?: boolean;
  manual?: boolean;
  status: "ready" | "missing" | "locked" | "unmapped";
}

export interface SyncTimeline {
  version: number;
  projectId: string;
  totalDuration: number;
  voiceBlocks: SyncVoiceBlock[];
  scenes: SyncScene[];
  generatedAt: number;
  mode: SyncMode;
}

export type SyncMode = "auto" | "fast" | "balanced" | "slow" | "custom";

export interface SyncOptions {
  mode: SyncMode;
  /** Target average scene duration (seconds) — used only in custom mode. */
  customTarget?: number;
  /** Absolute clamps for a scene in this run. */
  minSecs?: number;
  maxSecs?: number;
}

export const MODE_TARGETS: Record<SyncMode, { target: number; min: number; max: number }> = {
  auto:     { target: 3.0, min: 1.8, max: 4.0 },
  fast:     { target: 2.25, min: 1.8, max: 3.0 },
  balanced: { target: 3.0, min: 2.0, max: 3.5 },
  slow:     { target: 3.75, min: 3.0, max: 4.5 },
  custom:   { target: 3.0, min: 1.8, max: 5.0 },
};

// ---------------- Storage ----------------

const STORAGE_KEY = "docos.voiceSync";
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}
function readAll(): Record<string, SyncTimeline> {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function writeAll(all: Record<string, SyncTimeline>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* quota */ }
  emit();
}

export function readSyncTimeline(topicId: string | null): SyncTimeline | null {
  if (!topicId) return null;
  return readAll()[topicId] ?? null;
}

export function saveSyncTimeline(t: SyncTimeline) {
  const all = readAll();
  all[t.projectId] = t;
  writeAll(all);
}

export function deleteSyncTimeline(topicId: string) {
  const all = readAll();
  delete all[topicId];
  writeAll(all);
}

export function useSyncTimeline(topicId: string | null): SyncTimeline | null {
  const snap = useSyncExternalStore(
    subscribe,
    () => (typeof localStorage === "undefined" ? "" : localStorage.getItem(STORAGE_KEY) ?? ""),
    () => "",
  );
  if (!topicId) return null;
  if (!snap) return null;
  try { return (JSON.parse(snap) as Record<string, SyncTimeline>)[topicId] ?? null; }
  catch { return null; }
}

// ---------------- Duration lookup ----------------

/** Real voice duration for a block: real > exported meta > estimate. */
export function resolveBlockDuration(topicId: string, b: VoiceBlock): number {
  if (typeof b.realSeconds === "number" && b.realSeconds > 0) return b.realSeconds;
  const meta = getVoiceMeta(voiceBlockId(topicId, b.index));
  if (meta && meta.duration > 0) return meta.duration;
  return b.estSeconds || estimateSeconds(b.text);
}

// ---------------- Mapping algorithm ----------------

const WORD_RE = /[a-z0-9']+/gi;
function words(s: string): string[] { return (s.toLowerCase().match(WORD_RE) ?? []); }
function wordCount(s: string): number { return words(s).length; }

/** Score how well a scene voiceover line overlaps a block's text. */
function overlapScore(sceneLine: string, blockText: string): number {
  const a = new Set(words(sceneLine));
  const b = new Set(words(blockText));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}

export interface BuildInput {
  projectId: string;
  voice: VoiceProject;
  scenes: VisualScene[];
  hasImage: (sceneNumber: number) => boolean;
  options: SyncOptions;
  /** Preserve manual overrides for these locked scene numbers when possible. */
  previous?: SyncTimeline | null;
}

/** Deterministic Auto Sync — pure local computation. */
export function buildSyncTimeline(input: BuildInput): { timeline: SyncTimeline; warnings: string[] } {
  const warnings: string[] = [];
  const { projectId, voice, scenes, hasImage, options, previous } = input;

  const cfg = MODE_TARGETS[options.mode];
  const targetAvg = options.mode === "custom" && options.customTarget
    ? Math.max(1.5, Math.min(6, options.customTarget))
    : cfg.target;
  const minSecs = options.minSecs ?? cfg.min;
  const maxSecs = options.maxSecs ?? cfg.max;

  // 1. Build voice-block timeline from real durations.
  const sortedBlocks = [...voice.blocks].sort((a, b) => a.index - b.index);
  const vBlocks: SyncVoiceBlock[] = [];
  let clock = 0;
  for (const b of sortedBlocks) {
    const dur = Math.max(0.1, resolveBlockDuration(projectId, b));
    vBlocks.push({
      blockIndex: b.index,
      start: clock,
      end: clock + dur,
      duration: dur,
      text: b.text,
      audioId: `voice:${projectId}:${b.index}`,
    });
    clock += dur;
  }
  const totalDuration = clock;

  const orderedScenes = [...scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

  // 2. Assign each scene to the voice block it primarily belongs to.
  //    Strategy: pick best-overlap block within a monotonic sliding window so
  //    scene order and block order are preserved.
  let cursor = 0;
  const sceneToBlock: number[] = [];
  for (let i = 0; i < orderedScenes.length; i++) {
    const line = orderedScenes[i].voiceoverLine ?? "";
    let bestIdx = cursor;
    let bestScore = -1;
    // Look at cursor..cursor+3 to allow slight look-ahead but keep order.
    for (let j = cursor; j < Math.min(vBlocks.length, cursor + 4); j++) {
      const s = overlapScore(line, vBlocks[j].text);
      if (s > bestScore) { bestScore = s; bestIdx = j; }
    }
    // If we have many more scenes than blocks, advance cursor proportionally.
    if (orderedScenes.length > vBlocks.length) {
      const proportional = Math.floor((i * vBlocks.length) / Math.max(1, orderedScenes.length));
      if (bestScore <= 0) bestIdx = proportional;
      cursor = Math.max(cursor, Math.min(vBlocks.length - 1, proportional));
    } else {
      cursor = bestIdx;
    }
    sceneToBlock.push(bestIdx);
  }

  // 3. Ensure every voice block has at least one scene (no dropped narration).
  const covered = new Set(sceneToBlock);
  for (let b = 0; b < vBlocks.length; b++) {
    if (covered.has(b)) continue;
    // Attach to nearest scene by proportional position.
    const targetSceneIdx = Math.min(
      orderedScenes.length - 1,
      Math.max(0, Math.round((b / Math.max(1, vBlocks.length - 1)) * (orderedScenes.length - 1))),
    );
    if (targetSceneIdx >= 0) sceneToBlock[targetSceneIdx] = b;
  }

  // 4. Group scenes by block index and distribute block duration by word count.
  const byBlock = new Map<number, number[]>();
  sceneToBlock.forEach((bIdx, sIdx) => {
    if (!byBlock.has(bIdx)) byBlock.set(bIdx, []);
    byBlock.get(bIdx)!.push(sIdx);
  });

  const outScenes: SyncScene[] = new Array(orderedScenes.length);
  for (let b = 0; b < vBlocks.length; b++) {
    const block = vBlocks[b];
    const idxs = (byBlock.get(b) ?? []).sort((a, z) => a - z);
    if (!idxs.length) continue;
    const weights = idxs.map((i) => Math.max(1, wordCount(orderedScenes[i].voiceoverLine ?? "")));
    const totalW = weights.reduce((s, w) => s + w, 0);
    let t = block.start;
    for (let k = 0; k < idxs.length; k++) {
      const sIdx = idxs[k];
      const scene = orderedScenes[sIdx];
      const share = (weights[k] / totalW) * block.duration;
      // Clamp to allowed range (but final scene of block absorbs remainder).
      let dur = share;
      if (k < idxs.length - 1) {
        dur = Math.max(minSecs, Math.min(maxSecs, share));
      } else {
        dur = Math.max(0.1, block.end - t);
      }
      const start = t;
      const end = Math.min(block.end, start + dur);
      outScenes[sIdx] = {
        sceneId: `scene-${scene.sceneNumber}`,
        sceneNumber: scene.sceneNumber,
        start,
        end,
        duration: end - start,
        voiceBlockStart: b,
        voiceBlockEnd: b,
        imageId: `scene:${projectId}:${scene.sceneNumber}`,
        narrationText: scene.voiceoverLine ?? "",
        missingImage: !hasImage(scene.sceneNumber),
        status: hasImage(scene.sceneNumber) ? "ready" : "missing",
      };
      t = end;
    }
  }

  // 5. Fill any gaps caused by scenes that were re-routed above.
  const finalScenes: SyncScene[] = [];
  let prevEnd = 0;
  for (let i = 0; i < orderedScenes.length; i++) {
    const s = outScenes[i];
    if (s) {
      if (s.start < prevEnd) { s.start = prevEnd; s.end = Math.max(prevEnd, s.end); s.duration = s.end - s.start; }
      finalScenes.push(s);
      prevEnd = s.end;
    } else {
      const scene = orderedScenes[i];
      finalScenes.push({
        sceneId: `scene-${scene.sceneNumber}`,
        sceneNumber: scene.sceneNumber,
        start: prevEnd,
        end: prevEnd,
        duration: 0,
        voiceBlockStart: 0,
        voiceBlockEnd: 0,
        imageId: `scene:${projectId}:${scene.sceneNumber}`,
        narrationText: scene.voiceoverLine ?? "",
        missingImage: !hasImage(scene.sceneNumber),
        status: "unmapped",
      });
    }
  }

  // 6. Reapply locked scenes from previous sync if present (preserve overrides).
  if (previous) {
    const prevLocked = new Map(previous.scenes.filter((s) => s.locked).map((s) => [s.sceneNumber, s]));
    for (const s of finalScenes) {
      const lk = prevLocked.get(s.sceneNumber);
      if (lk) {
        s.locked = true;
        s.manual = true;
        s.start = lk.start;
        s.end = lk.end;
        s.duration = lk.end - lk.start;
        s.status = "locked";
      }
    }
  }

  // 7. Warnings.
  if (totalDuration > 0) {
    const avg = totalDuration / Math.max(1, finalScenes.length);
    if (avg > maxSecs + 0.5) warnings.push(`More scenes are needed for smooth pacing. Average is ${avg.toFixed(1)}s.`);
    if (avg < minSecs - 0.2) warnings.push(`Too many scenes for the narration — pacing will feel rushed.`);
  }
  const missing = finalScenes.filter((s) => s.missingImage).length;
  if (missing) warnings.push(`${missing} scene${missing === 1 ? "" : "s"} missing images.`);

  const timeline: SyncTimeline = {
    version: SYNC_VERSION,
    projectId,
    totalDuration,
    voiceBlocks: vBlocks,
    scenes: finalScenes,
    generatedAt: Date.now(),
    mode: options.mode,
  };
  return { timeline, warnings };
}

// ---------------- Validation ----------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  coverage: number;
}

export function validateTimeline(t: SyncTimeline): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let coveredSecs = 0;
  for (let i = 0; i < t.scenes.length; i++) {
    const s = t.scenes[i];
    if (s.end < s.start) errors.push(`Scene ${s.sceneNumber}: negative duration.`);
    if (i > 0) {
      const prev = t.scenes[i - 1];
      if (s.start + 0.001 < prev.end) errors.push(`Scene ${s.sceneNumber}: overlaps previous scene.`);
      else if (s.start - prev.end > 0.1) warnings.push(`Gap of ${(s.start - prev.end).toFixed(2)}s before scene ${s.sceneNumber}.`);
    }
    if (!s.locked) {
      if (s.duration > 4.01 && s.duration <= 5.01) warnings.push(`Scene ${s.sceneNumber}: ${s.duration.toFixed(2)}s (complex).`);
      else if (s.duration > 5.01) errors.push(`Scene ${s.sceneNumber}: ${s.duration.toFixed(2)}s exceeds 5s cap.`);
      if (s.duration < 1.8 && s.duration > 0) warnings.push(`Scene ${s.sceneNumber}: ${s.duration.toFixed(2)}s below 1.8s minimum.`);
    }
    coveredSecs += s.duration;
  }
  if (t.scenes.length && t.totalDuration > 0) {
    const last = t.scenes[t.scenes.length - 1];
    const drift = Math.abs(last.end - t.totalDuration);
    if (drift > 0.25) errors.push(`Final scene ends ${drift.toFixed(2)}s away from narration end.`);
  }
  const coverage = t.totalDuration > 0 ? Math.min(1, coveredSecs / t.totalDuration) : 0;
  return { ok: errors.length === 0, errors, warnings, coverage };
}

// ---------------- Manual ops ----------------

export function setSceneBoundary(t: SyncTimeline, sceneNumber: number, newEnd: number): SyncTimeline {
  const scenes = t.scenes.map((s) => ({ ...s }));
  const i = scenes.findIndex((s) => s.sceneNumber === sceneNumber);
  if (i < 0 || i === scenes.length - 1) return t;
  const s = scenes[i];
  const next = scenes[i + 1];
  const min = s.start + 0.5;
  const max = next.end - 0.5;
  const clamped = Math.max(min, Math.min(max, newEnd));
  s.end = clamped; s.duration = s.end - s.start; s.manual = true;
  next.start = clamped; next.duration = next.end - next.start; next.manual = true;
  return { ...t, scenes };
}

export function toggleSceneLock(t: SyncTimeline, sceneNumber: number): SyncTimeline {
  return { ...t, scenes: t.scenes.map((s) => s.sceneNumber === sceneNumber ? { ...s, locked: !s.locked } : s) };
}

export function splitScene(t: SyncTimeline, sceneNumber: number): SyncTimeline {
  const idx = t.scenes.findIndex((s) => s.sceneNumber === sceneNumber);
  if (idx < 0) return t;
  const s = t.scenes[idx];
  if (s.duration < 2) return t;
  const mid = s.start + s.duration / 2;
  const newNum = Math.max(...t.scenes.map((x) => x.sceneNumber)) + 1;
  const left = { ...s, end: mid, duration: mid - s.start, manual: true };
  const right: SyncScene = { ...s, sceneId: `scene-${newNum}`, sceneNumber: newNum, start: mid, duration: s.end - mid, missingImage: true, manual: true };
  const scenes = [...t.scenes.slice(0, idx), left, right, ...t.scenes.slice(idx + 1)];
  return { ...t, scenes };
}

export function mergeWithNext(t: SyncTimeline, sceneNumber: number): SyncTimeline {
  const idx = t.scenes.findIndex((s) => s.sceneNumber === sceneNumber);
  if (idx < 0 || idx === t.scenes.length - 1) return t;
  const a = t.scenes[idx];
  const b = t.scenes[idx + 1];
  const merged: SyncScene = { ...a, end: b.end, duration: b.end - a.start, manual: true };
  const scenes = [...t.scenes.slice(0, idx), merged, ...t.scenes.slice(idx + 2)];
  return { ...t, scenes };
}

// ---------------- Export ----------------

export function timelineToTimingJSON(t: SyncTimeline): string {
  return JSON.stringify({
    projectId: t.projectId,
    totalDuration: t.totalDuration,
    generatedAt: t.generatedAt,
    mode: t.mode,
    voiceBlocks: t.voiceBlocks,
    scenes: t.scenes,
  }, null, 2);
}