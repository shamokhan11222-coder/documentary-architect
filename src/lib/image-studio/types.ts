// Image Studio — production domain types.
// Locks + provider registry + consistency scores are the studio's
// state on top of the existing image-queue runner.

export interface CharacterLock {
  masterImage: string | null; // data URL
  name: string;
  face: boolean;
  body: boolean;
  clothes: boolean;
  hair: boolean;
  accessories: boolean;
  expression: boolean;
  style: boolean;
  poseFamily: boolean;
  notes: string;
}

export interface StyleLock {
  artStyle: string;
  lighting: string;
  lineWeight: string;
  cameraAngle: string;
  colorPalette: string;
  backgroundStyle: string;
  aspectRatio: string;
  perspective: string;
}

export interface BackgroundLock {
  environment: string;
  weather: string;
  time: string;
  fog: string;
  snow: string;
  sky: string;
  landscape: string;
}

export interface StudioLocks {
  character: CharacterLock;
  style: StyleLock;
  background: BackgroundLock;
  enabled: boolean;
}

export type ProviderId =
  | "puter"
  | "pollinations"
  | "openrouter"
  | "gemini"
  | "grok"
  | "local-sdxl";

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  enabled: boolean;
  priority: number; // lower = tried first
  requiresKey: boolean;
  status: "ready" | "needs-key" | "coming-soon";
  description: string;
}

export interface ConsistencyScore {
  character: number;
  promptMatch: number;
  style: number;
  background: number;
  lighting: number;
  overall: number;
}

export interface HistoryEntry {
  id: string;
  sceneNumber: number;
  provider: ProviderId | "auto";
  prompt: string;
  at: number;
  score?: ConsistencyScore;
  ok: boolean;
  error?: string;
}

export interface StudioSettings {
  batchSize: number;
  minConsistency: number;
  autoRetry: boolean;
  failover: boolean;
  concurrency: number;
}