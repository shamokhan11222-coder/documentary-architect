export type StageId =
  | "research"
  | "story"
  | "storyboard"
  | "voice"
  | "voice-sync"
  | "images"
  | "motion"
  | "captions"
  | "music"
  | "sfx"
  | "color"
  | "transitions"
  | "render";

export type StageStatus = "pending" | "running" | "done" | "failed" | "waiting";

export type Mode = "guided" | "auto" | "professional";

export interface StageState {
  id: StageId;
  label: string;
  status: StageStatus;
  progress: number; // 0..1
  total?: number;
  current?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  checkpoint?: unknown;
}

export interface DirectorProject {
  projectId: string;
  mode: Mode;
  currentStage: StageId | null;
  stages: Record<StageId, StageState>;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
  export: ExportConfig;
  motionPresets: Record<string, MotionPreset>; // sceneId -> preset
  captionPreset: CaptionPresetId;
  musicMood?: MusicMood;
  sfxCues: Record<string, string[]>; // sceneId -> sfx ids
}

export interface ExportConfig {
  resolution: "1080p" | "1440p" | "4K";
  fps: 30 | 60;
}

export type MotionPreset =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "tilt-up"
  | "tilt-down"
  | "ken-burns"
  | "camera-travel"
  | "focus-shift";

export type CaptionPresetId = "clean" | "bold" | "highlight" | "cinema";

export type MusicMood = "epic" | "dark" | "nature" | "mystery" | "hope" | "sad";

export const STAGES: { id: StageId; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "story", label: "Story" },
  { id: "storyboard", label: "Storyboard" },
  { id: "voice", label: "Voice" },
  { id: "voice-sync", label: "Voice Sync" },
  { id: "images", label: "Images" },
  { id: "motion", label: "Motion" },
  { id: "captions", label: "Captions" },
  { id: "music", label: "Music" },
  { id: "sfx", label: "SFX" },
  { id: "color", label: "Color" },
  { id: "transitions", label: "Transitions" },
  { id: "render", label: "Render" },
];