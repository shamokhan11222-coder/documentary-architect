import type { Pose } from "./rig-model";

const base: Pose = {
  headTilt: 0,
  torsoRotation: 0,
  rootY: 0,
  lShoulder: 10,
  lElbow: 0,
  rShoulder: -10,
  rElbow: 0,
  lHip: 5,
  lKnee: 0,
  rHip: -5,
  rKnee: 0,
  facing: 1,
};

export const POSES: Record<string, Pose> = {
  standing: { ...base },
  "walking-right": {
    ...base,
    facing: 1,
    lShoulder: -30, rShoulder: 30, lElbow: 20, rElbow: 20,
    lHip: 25, rHip: -25, lKnee: -15, rKnee: 10,
  },
  "walking-left": {
    ...base,
    facing: -1,
    lShoulder: 30, rShoulder: -30, lElbow: 20, rElbow: 20,
    lHip: -25, rHip: 25, lKnee: 10, rKnee: -15,
  },
  "pointing-right": {
    ...base,
    facing: 1,
    rShoulder: -90, rElbow: 0,
    lShoulder: 15, lElbow: 10,
  },
  "pointing-left": {
    ...base,
    facing: -1,
    rShoulder: -90, rElbow: 0,
    lShoulder: 15, lElbow: 10,
  },
  "sitting-ground": {
    ...base,
    rootY: 40,
    lHip: 95, rHip: 95, lKnee: -85, rKnee: -85,
    lShoulder: -20, rShoulder: 20,
  },
  "sitting-chair": {
    ...base,
    rootY: 20,
    lHip: 90, rHip: 90, lKnee: 90, rKnee: 90,
    lShoulder: 15, rShoulder: -15,
  },
  sleeping: {
    ...base,
    torsoRotation: 90,
    rootY: 60,
    lShoulder: 5, rShoulder: -5,
    lHip: 5, rHip: -5,
  },
  running: {
    ...base,
    facing: 1,
    lShoulder: -55, rShoulder: 55, lElbow: 60, rElbow: 60,
    lHip: 45, rHip: -45, lKnee: -60, rKnee: 30,
  },
  "holding-object": {
    ...base,
    lShoulder: -60, rShoulder: 60, lElbow: 70, rElbow: 70,
  },
  "looking-up": { ...base, headTilt: -20 },
  confused: { ...base, headTilt: 12, rShoulder: -40, rElbow: 60 },
  worried: { ...base, headTilt: 8, lShoulder: 20, rShoulder: -20, lElbow: 15, rElbow: 15 },
  happy: { ...base, lShoulder: -40, rShoulder: 40, lElbow: 15, rElbow: 15 },
  shocked: { ...base, headTilt: -6, lShoulder: -70, rShoulder: 70, lElbow: 30, rElbow: 30 },
};

export const POSE_NAMES = Object.keys(POSES);

export const TEST_PANEL_POSES = [
  "standing",
  "walking-right",
  "pointing-right",
  "sitting-chair",
  "sleeping",
  "running",
] as const;

export function getPose(name: string): Pose {
  return { ...(POSES[name] ?? POSES.standing) };
}