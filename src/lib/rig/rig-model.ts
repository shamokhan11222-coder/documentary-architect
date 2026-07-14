// Rig model — a stick figure defined ONLY by trait tokens + joint lengths.
// Poses mutate joint angles; they never touch proportions.

export type EyeStyle = "dots" | "circles" | "crosses" | "closed";
export type MouthStyle = "line" | "smile" | "frown" | "open" | "worried";
export type HandStyle = "none" | "dot" | "stub";
export type FootStyle = "none" | "dot" | "stub";

export interface RigTraits {
  lineThickness: number;      // px at the rig's canonical 200x260 viewbox
  headRadius: number;         // px
  eyeStyle: EyeStyle;
  mouthStyle: MouthStyle;
  handStyle: HandStyle;
  footStyle: FootStyle;
  outlineRoughness: number;   // 0..1 — feeds SVG turbulence displacement
  strokeColor: string;
}

export interface RigLengths {
  neck: number;
  torso: number;
  upperArm: number;
  lowerArm: number;
  upperLeg: number;
  lowerLeg: number;
}

export interface Rig {
  traits: RigTraits;
  lengths: RigLengths;
}

export interface Pose {
  headTilt: number;      // deg
  torsoRotation: number; // deg, 0 = upright, 90 = lying
  rootY: number;         // offset from canvas center
  lShoulder: number;
  lElbow: number;
  rShoulder: number;
  rElbow: number;
  lHip: number;
  lKnee: number;
  rHip: number;
  rKnee: number;
  facing: 1 | -1;        // 1 = right, -1 = left (mirrors horizontally)
}

export interface Expression {
  eyeStyle: EyeStyle;
  mouthStyle: MouthStyle;
  eyeDirection: "center" | "up" | "down" | "left" | "right";
  eyebrow: "neutral" | "worried" | "angry" | "surprised";
}

export const DEFAULT_TRAITS: RigTraits = {
  lineThickness: 4,
  headRadius: 22,
  eyeStyle: "dots",
  mouthStyle: "line",
  handStyle: "none",
  footStyle: "none",
  outlineRoughness: 0.35,
  strokeColor: "#111111",
};

export const DEFAULT_LENGTHS: RigLengths = {
  neck: 8,
  torso: 62,
  upperArm: 32,
  lowerArm: 30,
  upperLeg: 38,
  lowerLeg: 36,
};

export const DEFAULT_EXPRESSION: Expression = {
  eyeStyle: "dots",
  mouthStyle: "line",
  eyeDirection: "center",
  eyebrow: "neutral",
};

export function defaultRig(): Rig {
  return { traits: { ...DEFAULT_TRAITS }, lengths: { ...DEFAULT_LENGTHS } };
}

export const RIG_VIEWBOX = { w: 200, h: 260 } as const;

/** Public identifier for the currently approved rig, used across IndexedDB keys. */
export const RIG_KEY = "rig:active";
export const RIG_REFERENCE_KEY = "rig:reference";
export const RIG_REFERENCE_ORIGINAL_KEY = "rig:reference:original";