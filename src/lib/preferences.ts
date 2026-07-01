// Learn My Style — permanent memory of what the editor likes/loves/dislikes.
// Every 👍 / ❤️ / 👎 is recorded here and fed silently into generation.
import { readLocal, writeLocal, useLocal } from "./local";
import type { FeedbackEntry, FeedbackRating } from "./types";

const KEY = "docos.feedback";

export function useFeedback(): FeedbackEntry[] {
  return useLocal<FeedbackEntry[]>(KEY, []);
}

export function recordFeedback(
  kind: string,
  rating: FeedbackRating,
  content: string,
  topicId?: string,
) {
  const list = readLocal<FeedbackEntry[]>(KEY, []);
  // Replace an existing rating for the same content+kind so a reaction toggles.
  const filtered = list.filter(
    (f) => !(f.kind === kind && f.content === content),
  );
  const entry: FeedbackEntry = {
    id: crypto.randomUUID(),
    kind,
    rating,
    content: content.slice(0, 600),
    topicId,
    at: Date.now(),
  };
  writeLocal(KEY, [entry, ...filtered].slice(0, 500));
}

export function getFeedbackFor(kind: string, content: string): FeedbackRating | null {
  const list = readLocal<FeedbackEntry[]>(KEY, []);
  const hit = list.find((f) => f.kind === kind && f.content === content);
  return hit?.rating ?? null;
}

export function useFeedbackFor(kind: string, content: string): FeedbackRating | null {
  const list = useFeedback();
  return list.find((f) => f.kind === kind && f.content === content)?.rating ?? null;
}

export function clearFeedback() {
  writeLocal(KEY, []);
}

/**
 * Compact, prompt-ready summary of learned taste. Injected into generations so
 * every expert respects the editor's preferences.
 */
export function getStyleProfile(): string {
  const list = readLocal<FeedbackEntry[]>(KEY, []);
  if (!list.length) return "";
  const loved = list.filter((f) => f.rating === "favorite").map((f) => `${f.kind}: ${f.content}`);
  const good = list.filter((f) => f.rating === "good").map((f) => `${f.kind}: ${f.content}`);
  const bad = list.filter((f) => f.rating === "bad").map((f) => `${f.kind}: ${f.content}`);
  const lines: string[] = ["EDITOR STYLE PROFILE (obey this):"];
  if (loved.length) lines.push(`LOVE (lean into): ${loved.slice(0, 25).join(" | ")}`);
  if (good.length) lines.push(`LIKE: ${good.slice(0, 25).join(" | ")}`);
  if (bad.length) lines.push(`AVOID (never repeat this style): ${bad.slice(0, 25).join(" | ")}`);
  return lines.join("\n");
}
