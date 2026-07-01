// AI Manager — the master orchestrator. Defines the production pipeline, knows
// which stages are done (smart cache), and decides what to generate next.
import { readLocal } from "./local";

export type StageKey =
  | "research"
  | "story"
  | "storyboard"
  | "images"
  | "thumbnail"
  | "seo"
  | "rating";

export interface StageDef {
  key: StageKey;
  label: string;
  expert: string;
}

export const PIPELINE: StageDef[] = [
  { key: "research", label: "Research", expert: "Research Expert" },
  { key: "story", label: "Story", expert: "Story Architect" },
  { key: "storyboard", label: "Storyboard", expert: "Visual Director" },
  { key: "images", label: "Images", expert: "Visual Director" },
  { key: "thumbnail", label: "Thumbnail", expert: "Thumbnail Designer" },
  { key: "seo", label: "SEO", expert: "SEO Specialist" },
  { key: "rating", label: "Rating", expert: "Quality Reviewer" },
];

const KEYS: Record<Exclude<StageKey, "images">, string> = {
  research: "docos.research",
  story: "docos.story",
  storyboard: "docos.visual",
  thumbnail: "docos.thumbnails",
  seo: "docos.seo",
  rating: "docos.rating",
};

/** Smart cache: has this stage already been produced for the topic? */
export function stageDone(topicId: string, stage: StageKey): boolean {
  if (stage === "images") {
    // images are considered "done" once a storyboard exists AND at least one
    // image record is present in localStorage image cache index.
    const visual = readLocal<Record<string, unknown>>(KEYS.storyboard, {});
    return !!visual[topicId];
  }
  const map = readLocal<Record<string, unknown>>(KEYS[stage], {});
  return !!map[topicId];
}

/** The next stage the manager should generate, or null when complete. */
export function nextStage(topicId: string): StageKey | null {
  for (const s of PIPELINE) {
    if (!stageDone(topicId, s.key)) return s.key;
  }
  return null;
}

export function completionPercent(topicId: string): number {
  const done = PIPELINE.filter((s) => stageDone(topicId, s.key)).length;
  return Math.round((done / PIPELINE.length) * 100);
}
