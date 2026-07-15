import type { DirectorProject, StageId, StageState } from "./types";
import { STAGES } from "./types";

const KEY = (projectId: string) => `director:${projectId}`;

export function loadProject(projectId: string): DirectorProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as DirectorProject;
  } catch {
    return null;
  }
}

export function saveProject(project: DirectorProject) {
  if (typeof window === "undefined") return;
  project.updatedAt = Date.now();
  localStorage.setItem(KEY(project.projectId), JSON.stringify(project));
}

export function newProject(projectId: string, mode: DirectorProject["mode"]): DirectorProject {
  const stages: Record<StageId, StageState> = {} as Record<StageId, StageState>;
  for (const s of STAGES) {
    stages[s.id] = { id: s.id, label: s.label, status: "pending", progress: 0 };
  }
  return {
    projectId,
    mode,
    currentStage: null,
    stages,
    paused: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    export: { resolution: "1080p", fps: 30 },
    motionPresets: {},
    captionPreset: "bold",
    sfxCues: {},
    locks: { scenes: [], prompts: [], character: false, backgrounds: [] },
    suggestions: [],
  };
}

export function updateStage(
  project: DirectorProject,
  id: StageId,
  patch: Partial<StageState>,
): DirectorProject {
  const next = {
    ...project,
    stages: { ...project.stages, [id]: { ...project.stages[id], ...patch } },
  };
  saveProject(next);
  return next;
}

export function listCheckpoints(): string[] {
  if (typeof window === "undefined") return [];
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("director:")) out.push(k.slice("director:".length));
  }
  return out;
}