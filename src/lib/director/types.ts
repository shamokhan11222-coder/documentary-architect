export type StageId =
  | "topic"
  | "research"
  | "story"
  | "scene-planner"
  | "voice"
  | "voice-sync"
  | "images"
  | "camera-motion"
  | "subtitle-timing"
  | "music"
  | "sfx"
  | "thumbnail"
  | "seo"
  | "export-queue";

export type StageStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "waiting"
  | "skipped";

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
  /** Approval flag: undefined = untouched, true = approved, false = needs review. */
  approved?: boolean;
  /** Free-form auto-detected warnings for this stage. */
  warnings?: string[];
  /** Human label for what this stage is waiting on, e.g. "Voice", "Images". */
  waitingFor?: string;
  /** True when a running stage has stopped making progress. */
  stalled?: boolean;
  /** Timestamp of the last progress update — used for stall detection. */
  lastProgressAt?: number;
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
  /** Director memory — user-locked artifacts that must never be regenerated. */
  locks: DirectorLocks;
  /** Persistent Director suggestions (regenerable list). */
  suggestions: string[];
}

export interface DirectorLocks {
  scenes: number[];
  prompts: number[];
  character: boolean;
  backgrounds: number[];
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
  { id: "topic", label: "Topic" },
  { id: "research", label: "Research" },
  { id: "story", label: "Story" },
  { id: "scene-planner", label: "Scene Planner" },
  { id: "voice", label: "Voice" },
  { id: "voice-sync", label: "Voice Sync" },
  { id: "images", label: "Image Queue" },
  { id: "camera-motion", label: "Camera Motion" },
  { id: "subtitle-timing", label: "Subtitle Timing" },
  { id: "music", label: "Music" },
  { id: "sfx", label: "SFX" },
  { id: "thumbnail", label: "Thumbnail Draft" },
  { id: "seo", label: "SEO" },
  { id: "export-queue", label: "Export Queue" },
];