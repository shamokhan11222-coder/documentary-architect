// Pure client-side consistency scorer. No paid provider calls.
// Heuristic: token overlap between the scene brief, the locks, and the
// prompt / provider echo. Overall = weighted average.
import type { ConsistencyScore, StudioLocks } from "./types";
import type { VisualScene } from "../types";

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function overlap(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 100;
  let hit = 0;
  A.forEach((t) => {
    if (B.has(t)) hit++;
  });
  return Math.round((hit / Math.max(1, A.size)) * 100);
}

function containsAll(prompt: string, needles: string[]): number {
  const p = prompt.toLowerCase();
  const active = needles.filter(Boolean);
  if (!active.length) return 100;
  let hit = 0;
  for (const n of active) if (p.includes(n.toLowerCase())) hit++;
  return Math.round((hit / active.length) * 100);
}

export function scoreImage(
  scene: VisualScene,
  locks: StudioLocks,
  finalPrompt: string,
): ConsistencyScore {
  const character = containsAll(finalPrompt, [
    locks.character.name,
    ...(locks.character.face ? ["face"] : []),
    ...(locks.character.clothes ? ["clothes"] : []),
    ...(locks.character.hair ? ["hair"] : []),
  ]);
  const promptMatch = overlap(scene.visualDescription, finalPrompt);
  const style = containsAll(finalPrompt, [locks.style.artStyle, locks.style.colorPalette]);
  const background = containsAll(finalPrompt, [
    scene.background,
    locks.background.environment,
    locks.background.landscape,
  ]);
  const lighting = containsAll(finalPrompt, [locks.style.lighting]);
  const overall = Math.round(
    character * 0.3 + promptMatch * 0.3 + style * 0.15 + background * 0.15 + lighting * 0.1,
  );
  return { character, promptMatch, style, background, lighting, overall };
}

export function scoreBand(overall: number): "good" | "warn" | "poor" {
  if (overall >= 85) return "good";
  if (overall >= 70) return "warn";
  return "poor";
}