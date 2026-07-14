import type { Pose, Rig } from "../rig/rig-model";

export interface JointMap {
  pelvis: { x: number; y: number };
  neck: { x: number; y: number };
  headCenter: { x: number; y: number };
  lHand: { x: number; y: number };
  rHand: { x: number; y: number };
  lFoot: { x: number; y: number };
  rFoot: { x: number; y: number };
  /** End of the primary "pointing" arm, extended a bit further. */
  pointingTarget: { x: number; y: number };
}

/** Joint positions in RIG local coordinates (200x260 viewbox), before facing/scale.
 *  Mirrors the geometry in render-svg.tsx. */
export function computeJoints(rig: Rig, pose: Pose): JointMap {
  const { lengths } = rig;
  const pelvisX = 100;
  const pelvisY = 130 + pose.rootY;
  const neck = { x: pelvisX, y: pelvisY - lengths.torso };
  const headCenter = { x: neck.x, y: neck.y - lengths.neck - rig.traits.headRadius };

  const lArm = limb(neck, pose.lShoulder, pose.lElbow, lengths.upperArm, lengths.lowerArm);
  const rArm = limb(neck, pose.rShoulder, pose.rElbow, lengths.upperArm, lengths.lowerArm);
  const lLeg = limb({ x: pelvisX, y: pelvisY }, pose.lHip, pose.lKnee, lengths.upperLeg, lengths.lowerLeg);
  const rLeg = limb({ x: pelvisX, y: pelvisY }, pose.rHip, pose.rKnee, lengths.upperLeg, lengths.lowerLeg);

  // Pointing target: pick whichever arm reaches further from the torso.
  const lDist = Math.hypot(lArm.end.x - neck.x, lArm.end.y - neck.y);
  const rDist = Math.hypot(rArm.end.x - neck.x, rArm.end.y - neck.y);
  const primary = rDist >= lDist ? rArm : lArm;
  const dx = primary.end.x - neck.x;
  const dy = primary.end.y - neck.y;
  const mag = Math.max(1, Math.hypot(dx, dy));
  const ext = 30; // extra px along the arm direction
  const pointingTarget = {
    x: primary.end.x + (dx / mag) * ext,
    y: primary.end.y + (dy / mag) * ext,
  };

  return {
    pelvis: { x: pelvisX, y: pelvisY },
    neck,
    headCenter,
    lHand: lArm.end,
    rHand: rArm.end,
    lFoot: lLeg.end,
    rFoot: rLeg.end,
    pointingTarget,
  };
}

function limb(
  origin: { x: number; y: number },
  a1Deg: number,
  a2Deg: number,
  upper: number,
  lower: number,
) {
  const a1 = (a1Deg * Math.PI) / 180;
  const mid = { x: origin.x + Math.sin(a1) * upper, y: origin.y + Math.cos(a1) * upper };
  const a2 = ((a1Deg + a2Deg) * Math.PI) / 180;
  const end = { x: mid.x + Math.sin(a2) * lower, y: mid.y + Math.cos(a2) * lower };
  return { mid, end };
}

/** Character footprint in rig-local coords: y of the lower foot. */
export function characterFootY(joints: JointMap): number {
  return Math.max(joints.lFoot.y, joints.rFoot.y);
}

/** Character head-top y in rig-local coords. */
export function characterHeadTopY(rig: Rig, joints: JointMap): number {
  return joints.headCenter.y - rig.traits.headRadius;
}

/** Transform a rig-local point to world coords, given the character's world
 *  placement (feet at (worldX, groundY)), scale, and facing. */
export function rigLocalToWorld(
  local: { x: number; y: number },
  worldFeet: { x: number; groundY: number },
  scale: number,
  facing: 1 | -1,
  footYLocal: number,
) {
  // Rig group is transformed: translate(worldFeet.x, groundY) then scale(scale) then
  // translate(-100, -footYLocal) then facing mirror around x=100.
  const mirrored = facing === -1 ? { x: 200 - local.x, y: local.y } : local;
  return {
    x: worldFeet.x + (mirrored.x - 100) * scale,
    y: worldFeet.groundY + (local.y - footYLocal) * scale,
  };
}