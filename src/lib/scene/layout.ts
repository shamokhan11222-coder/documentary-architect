import type { Rig } from "../rig/rig-model";
import { getPose } from "../rig/poses";
import type {
  CharacterSpec, LayoutWarning, ObjectSpec, SceneSpec,
} from "./scene-model";
import { DEFAULT_GROUND_Y, SAFE_MARGIN, SCENE_H, SCENE_W } from "./scene-model";
import { getObjectMeta } from "./object-library";
import {
  characterFootY, characterHeadTopY, computeJoints, rigLocalToWorld,
} from "./joints";

export interface ResolvedCharacter {
  spec: CharacterSpec;
  worldX: number;             // feet center world x
  groundY: number;
  scale: number;              // world-scale multiplier for the rig
  facing: 1 | -1;
  footYLocal: number;         // rig-local y of the character's grounded foot
  headTopWorld: { x: number; y: number };
  bbox: { x: number; y: number; w: number; h: number };
  joints: ReturnType<typeof computeJoints>;
}

export interface ResolvedObject {
  spec: ObjectSpec;
  cx: number;
  cy: number;
  scale: number;
  bbox: { x: number; y: number; w: number; h: number };
  layer: number;
  meta: ReturnType<typeof getObjectMeta>;
}

export interface ResolvedScene {
  scene: SceneSpec;
  characters: ResolvedCharacter[];
  objects: ResolvedObject[];
  warnings: LayoutWarning[];
  groundY: number;
}

const CAMERA_HEIGHT_PCT: Record<SceneSpec["camera"], number> = {
  wide: 0.35,
  medium: 0.55,
  close: 0.75,
};

function anchorX(anchor: string, fallback: number | undefined): number {
  if (anchor.endsWith("-left")) return SCENE_W * 0.22;
  if (anchor.endsWith("-center")) return SCENE_W * 0.5;
  if (anchor.endsWith("-right")) return SCENE_W * 0.78;
  return fallback ?? SCENE_W * 0.5;
}

function isSkyAnchor(a: string) {
  return a.startsWith("sky-");
}

function clampMargin(x: number, w: number) {
  const half = w / 2;
  return Math.max(SAFE_MARGIN + half, Math.min(SCENE_W - SAFE_MARGIN - half, x));
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function overlapArea(a: ResolvedObject["bbox"], b: ResolvedObject["bbox"]) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

export function resolveScene(scene: SceneSpec, rig: Rig): ResolvedScene {
  const warnings: LayoutWarning[] = [];
  const groundY = scene.background.groundY ?? DEFAULT_GROUND_Y;

  // 1. Resolve characters first (objects can attach to them).
  const characters: ResolvedCharacter[] = scene.characters.map((c) => {
    const pose = getPose(c.pose);
    const joints = computeJoints(rig, pose);
    const footY = characterFootY(joints);
    const headY = characterHeadTopY(rig, joints);
    const rigHeight = footY - headY; // in rig-local units
    const desiredHeightPx = SCENE_H * CAMERA_HEIGHT_PCT[scene.camera] * (c.scale ?? 1);
    const rigScale = desiredHeightPx / rigHeight;
    const worldX = clampMargin(c.x, 100 * rigScale);
    const g = c.grounded ? groundY : groundY - 40;

    const headTopWorld = rigLocalToWorld(
      { x: joints.headCenter.x, y: headY },
      { x: worldX, groundY: g },
      rigScale,
      pose.facing,
      footY,
    );
    const bboxW = 120 * rigScale;
    const bboxH = rigHeight * rigScale;
    return {
      spec: c,
      worldX,
      groundY: g,
      scale: rigScale,
      facing: pose.facing,
      footYLocal: footY,
      headTopWorld,
      joints,
      bbox: { x: worldX - bboxW / 2, y: g - bboxH, w: bboxW, h: bboxH },
    };
  });

  const primary = characters[0];

  // 2. Resolve objects.
  const objects: ResolvedObject[] = scene.objects.map((o) => {
    const meta = getObjectMeta(o.type);
    const s = o.scale ?? 1;
    const w = meta.w * s;
    const h = meta.h * s;
    let cx: number;
    let cy: number;
    let layer = 10;

    switch (o.anchor) {
      case "character-left-hand":
      case "character-right-hand": {
        if (!primary) { cx = SCENE_W / 2; cy = groundY - h / 2; break; }
        const local = o.anchor === "character-right-hand" ? primary.joints.rHand : primary.joints.lHand;
        const world = rigLocalToWorld(local, { x: primary.worldX, groundY: primary.groundY }, primary.scale, primary.facing, primary.footYLocal);
        cx = world.x; cy = world.y; layer = 30;
        break;
      }
      case "character-pointing-target": {
        if (!primary) { cx = SCENE_W / 2; cy = groundY - h / 2; break; }
        const world = rigLocalToWorld(primary.joints.pointingTarget, { x: primary.worldX, groundY: primary.groundY }, primary.scale, primary.facing, primary.footYLocal);
        // Ground-snap if the item is a grounded prop; otherwise align its center to arm end.
        if (["machine","tent","chair","table","tree","house","parking-meter","streetlight"].includes(o.type)) {
          cx = world.x + (primary.facing === 1 ? w * 0.4 : -w * 0.4);
          cy = groundY - h / 2;
        } else {
          cx = world.x + (primary.facing === 1 ? 20 : -20);
          cy = world.y;
        }
        layer = 15;
        break;
      }
      case "seated-under-character": {
        if (!primary) { cx = SCENE_W / 2; cy = groundY - h / 2; break; }
        cx = primary.worldX;
        cy = groundY - h / 2;
        layer = 15; // draw behind character
        break;
      }
      case "behind-character": {
        if (!primary) { cx = SCENE_W / 2; cy = groundY - h / 2; break; }
        cx = clampMargin((o.x ?? primary.worldX - 80), w);
        cy = groundY - h / 2;
        layer = 5;
        break;
      }
      default: {
        cx = clampMargin(o.x ?? anchorX(o.anchor, undefined), w);
        if (isSkyAnchor(o.anchor)) {
          const skyBottom = groundY - 60;
          cy = Math.min(skyBottom - h / 2, Math.max(SAFE_MARGIN + h / 2, o.y ?? SAFE_MARGIN + h / 2));
          layer = 2;
        } else if (o.anchor === "background" || o.role === "background") {
          cy = groundY - h / 2;
          layer = 8;
        } else if (o.anchor === "foreground" || o.role === "foreground") {
          cy = groundY - h / 2;
          layer = 30;
        } else {
          // ground-* anchors
          cy = o.y ?? groundY - h / 2;
          layer = 15;
        }
      }
    }

    // Canvas margin clamp for x.
    cx = clampMargin(cx, w);
    // Never let a grounded object dip below ground.
    if (
      o.anchor.startsWith("ground") ||
      o.anchor === "background" || o.anchor === "foreground" ||
      o.anchor === "seated-under-character" || o.anchor === "behind-character"
    ) {
      if (cy + h / 2 > groundY + 4) cy = groundY - h / 2;
    }

    return {
      spec: o, cx, cy, scale: s, layer,
      bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
      meta,
    };
  });

  // 3. Overlap resolution — nudge background props horizontally away from primary bbox.
  if (primary) {
    for (const obj of objects) {
      if (obj.layer >= 20) continue;
      const area = overlapArea(primary.bbox, obj.bbox);
      const primaryArea = primary.bbox.w * primary.bbox.h;
      if (area / Math.max(1, primaryArea) > 0.3) {
        const push = primary.worldX < SCENE_W / 2 ? +1 : -1;
        obj.cx = clampMargin(primary.worldX + push * (primary.bbox.w * 0.7 + obj.bbox.w * 0.7), obj.bbox.w);
        obj.bbox.x = obj.cx - obj.bbox.w / 2;
        if (overlapArea(primary.bbox, obj.bbox) / primaryArea > 0.15) {
          warnings.push({
            severity: "warn",
            target: obj.spec.id ?? obj.spec.type,
            message: `Could not fully resolve overlap between ${obj.spec.type} and character.`,
          });
        }
      }
    }
  }

  // 4. Character overlap check.
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      if (overlaps(characters[i].bbox, characters[j].bbox)) {
        warnings.push({ severity: "warn", message: `Characters ${i} and ${j} overlap.` });
      }
    }
  }

  // 5. Environment sanity.
  if (scene.environment === "indoor") {
    const outdoorTypes = new Set(["tree","sun","moon","cloud","house","road"]);
    for (const o of objects) if (outdoorTypes.has(o.spec.type)) {
      warnings.push({ severity: "warn", target: o.spec.type, message: `Outdoor object in indoor scene: ${o.spec.type}` });
    }
  }
  if (scene.environment === "infographic" && objects.some((o) => ["tree","sun","cloud","house"].includes(o.spec.type))) {
    warnings.push({ severity: "warn", message: "Infographic scenes should not contain decorative scenery." });
  }

  return { scene, characters, objects, warnings, groundY };
}