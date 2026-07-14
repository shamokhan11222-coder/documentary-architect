// Strict scene specification — every value is explicit; no random coords.

export type ObjectType =
  | "tree" | "sun" | "moon" | "cloud" | "streetlight" | "campfire"
  | "tent" | "chair" | "table" | "machine" | "parking-meter"
  | "arrow" | "red-circle" | "checkmark" | "cross" | "house" | "road"
  | "board" | "circle-row";

export type Anchor =
  | "ground-left" | "ground-center" | "ground-right"
  | "sky-left"    | "sky-center"    | "sky-right"
  | "character-left-hand" | "character-right-hand"
  | "character-pointing-target"
  | "seated-under-character"
  | "behind-character"
  | "foreground" | "background"
  | "free";

export type Layer = "background" | "background-props" | "characters" | "foreground" | "labels";

export interface CharacterSpec {
  rigId: string;              // reference to loaded rig (only "primary" for now)
  pose: string;               // pose name in the rig POSES map
  expression?: string;        // mouth style ("happy","worried",...)
  eyeDirection?: "center" | "up" | "down" | "left" | "right";
  eyebrow?: "neutral" | "worried" | "angry" | "surprised";
  x: number;                  // feet-center world x
  grounded: boolean;
  scale?: number;             // extra multiplier on top of camera scale (default 1)
}

export interface ObjectSpec {
  id?: string;
  type: ObjectType;
  role?: "background" | "foreground" | "prop";
  anchor: Anchor;
  x?: number;                 // required for anchors ending in -left/-center/-right or "free"
  y?: number;                 // required for "free"
  scale?: number;             // default 1
  attachTo?: string;          // rigId when anchor is character-*
  color?: string;             // optional accent
  data?: Record<string, unknown>; // per-type extras (e.g. board labels, circle count)
}

export interface LabelSpec {
  id?: string;
  text: string;
  x: number;
  y: number;
  size?: number;
}

export interface SceneSpec {
  sceneId: string;
  aspectRatio: "16:9";
  environment: "indoor" | "outdoor" | "infographic";
  timeOfDay: "day" | "night";
  camera: "wide" | "medium" | "close";
  background: {
    type: "plain" | "street" | "forest" | "room" | "campsite" | "classroom";
    groundY?: number;         // default 420
    skyColor?: string;        // default "#FFFFFF"
    groundColor?: string;
  };
  characters: CharacterSpec[];
  objects: ObjectSpec[];
  labels?: LabelSpec[];
}

export interface LayoutWarning {
  severity: "info" | "warn" | "error";
  message: string;
  target?: string;
}

export const SCENE_W = 960;
export const SCENE_H = 540;
export const SAFE_MARGIN = 40;
export const DEFAULT_GROUND_Y = 420;