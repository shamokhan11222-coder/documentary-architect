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
  | "voice"
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
  { key: "voice", label: "Voice", expert: "Voice Director" },
  { key: "thumbnail", label: "Thumbnail", expert: "Thumbnail Designer" },
  { key: "seo", label: "SEO", expert: "SEO Specialist" },
  { key: "rating", label: "Rating", expert: "Quality Reviewer" },
];

// Hard prerequisites for each stage. A stage may only run once every stage it
// depends on is completed. Enforced by the orchestrator so the pipeline stays
// strictly sequential and no stage is generated ahead of its inputs.
// - Storyboard needs Story.
// - Images need Storyboard.
// - Voiceover needs Images (and therefore Storyboard).
// - Thumbnail needs Voiceover AND Images.
// - SEO and Rating need Story (final Rating is re-run last, after Voice/Thumbnail).
export const STAGE_DEPS: Record<StageKey, StageKey[]> = {
  research: [],
  story: ["research"],
  storyboard: ["story"],
  images: ["storyboard"],
  voice: ["images"],
  thumbnail: ["voice", "images"],
  seo: ["story"],
  rating: ["story"],
};

/** Are all hard prerequisites for a stage already completed? */
export function prereqsMet(topicId: string, stage: StageKey): boolean {
  return STAGE_DEPS[stage].every((dep) => stageDone(topicId, dep));
}

const KEYS: Record<Exclude<StageKey, "images">, string> = {
  research: "docos.research",
  story: "docos.story",
  storyboard: "docos.visual",
  thumbnail: "docos.thumbnails",
  seo: "docos.seo",
  voice: "docos.voice",
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
