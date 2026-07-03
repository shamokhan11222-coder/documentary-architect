// V8 Production Pipeline — persisted per-project run state powering the
// Production Dashboard. Tracks per-stage status (pending/running/completed/
// failed), a running task label, ETA data, and a recent-activity log. Because
// everything is persisted in localStorage, a run can resume after a browser
// close, refresh, or network drop from the last completed task.
import { readLocal, writeLocal, useLocal } from "./local";
import { PIPELINE, stageDone, type StageKey } from "./manager";

// Persisted statuses are the base four; "locked" / "ready" / "retry" are
// derived/transient display states the orchestrator sets during a run.
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "locked"
  | "ready"
  | "retry";

export interface StageState {
  status: TaskStatus;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ActivityEntry {
  at: number;
  msg: string;
  level: "info" | "success" | "error";
}

export interface PipelineState {
  topicId: string;
  running: boolean;
  currentStage: StageKey | null;
  currentTask: string;
  stages: Record<string, StageState>;
  activity: ActivityEntry[];
  updatedAt: number;
  startedAt?: number;
}

const KEY = "docos.pipeline";

// Rough average duration per stage (ms) for a simple ETA estimate.
export const STAGE_ETA_MS: Record<StageKey, number> = {
  research: 25000,
  story: 35000,
  storyboard: 25000,
  images: 90000,
  thumbnail: 45000,
  seo: 20000,
  voice: 60000,
  rating: 20000,
};

function emptyState(topicId: string): PipelineState {
  const stages: Record<string, StageState> = {};
  for (const s of PIPELINE) {
    stages[s.key] = { status: stageDone(topicId, s.key) ? "completed" : "pending" };
  }
  return {
    topicId,
    running: false,
    currentStage: null,
    currentTask: "",
    stages,
    activity: [],
    updatedAt: Date.now(),
  };
}

function readAll(): Record<string, PipelineState> {
  return readLocal<Record<string, PipelineState>>(KEY, {});
}

export function getPipeline(topicId: string): PipelineState {
  const all = readAll();
  const existing = all[topicId];
  if (!existing) return emptyState(topicId);
  // Reconcile with smart cache — a stage may have been completed elsewhere.
  for (const s of PIPELINE) {
    if (!existing.stages[s.key]) existing.stages[s.key] = { status: "pending" };
    if (stageDone(topicId, s.key) && existing.stages[s.key].status !== "completed") {
      existing.stages[s.key] = { ...existing.stages[s.key], status: "completed" };
    }
  }
  return existing;
}

export function savePipeline(state: PipelineState) {
  const all = readAll();
  all[state.topicId] = { ...state, updatedAt: Date.now() };
  writeLocal(KEY, all);
}

export function usePipeline(topicId: string | null): PipelineState | null {
  const all = useLocal<Record<string, PipelineState>>(KEY, {});
  if (!topicId) return null;
  return all[topicId] ?? emptyState(topicId);
}

export function patchStage(topicId: string, stage: StageKey, patch: Partial<StageState>) {
  const state = getPipeline(topicId);
  state.stages[stage] = { ...state.stages[stage], ...patch };
  savePipeline(state);
}

export function logActivity(
  topicId: string,
  msg: string,
  level: ActivityEntry["level"] = "info",
) {
  const state = getPipeline(topicId);
  state.activity = [{ at: Date.now(), msg, level }, ...state.activity].slice(0, 60);
  savePipeline(state);
}

export function setRunning(topicId: string, running: boolean, currentStage: StageKey | null = null) {
  const state = getPipeline(topicId);
  state.running = running;
  state.currentStage = currentStage;
  if (running && !state.startedAt) state.startedAt = Date.now();
  if (!running) state.currentTask = "";
  savePipeline(state);
}

export function setTask(topicId: string, stage: StageKey, task: string) {
  const state = getPipeline(topicId);
  state.currentStage = stage;
  state.currentTask = task;
  savePipeline(state);
}

export function resetPipeline(topicId: string) {
  const all = readAll();
  delete all[topicId];
  writeLocal(KEY, all);
}

/** Estimated remaining time in ms based on pending/failed stages. */
export function etaRemainingMs(state: PipelineState): number {
  return PIPELINE.filter((s) => state.stages[s.key]?.status !== "completed").reduce(
    (sum, s) => sum + STAGE_ETA_MS[s.key],
    0,
  );
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}