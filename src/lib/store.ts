import { useCallback, useSyncExternalStore } from "react";
import type {
  PromptPack,
  RatingReport,
  Research,
  Seo,
  Story,
  TasteMemory,
  ThumbnailPack,
  Topic,
  VisualMap,
} from "./types";

const KEYS = {
  topics: "docos.topics",
  research: "docos.research",
  story: "docos.story",
  visual: "docos.visual",
  prompts: "docos.prompts",
  thumbnails: "docos.thumbnails",
  seo: "docos.seo",
  rating: "docos.rating",
  settings: "docos.settings",
  selected: "docos.selectedTopic",
  taste: "docos.taste",
} as const;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  emit();
}

function useStored<T>(key: string, fallback: T): T {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? "",
    () => "",
  );
  if (!snapshot) return fallback;
  return parseCached(key, snapshot, fallback);
}

// Parse cache: JSON.parse runs on every render otherwise, and each call returns
// a brand-new object reference — which defeats React.memo/useMemo downstream and
// causes needless re-renders. Caching by (key, raw string) means an unchanged
// snapshot always yields the SAME object identity, so consumers only re-render
// when the stored value actually changes.
const parseCache = new Map<string, { raw: string; value: unknown }>();

function parseCached<T>(key: string, raw: string, fallback: T): T {
  const hit = parseCache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  try {
    const value = JSON.parse(raw) as T;
    parseCache.set(key, { raw, value });
    return value;
  } catch {
    return fallback;
  }
}

// ---------------- Topics ----------------

export function useTopics(): Topic[] {
  return useStored<Topic[]>(KEYS.topics, []);
}

export function saveTopic(t: Omit<Topic, "id" | "favorite" | "savedAt">): Topic {
  const topics = read<Topic[]>(KEYS.topics, []);
  const topic: Topic = {
    ...t,
    id: crypto.randomUUID(),
    favorite: false,
    savedAt: Date.now(),
  };
  write(KEYS.topics, [topic, ...topics]);
  return topic;
}

export function deleteTopic(id: string) {
  write(
    KEYS.topics,
    read<Topic[]>(KEYS.topics, []).filter((t) => t.id !== id),
  );
  const research = read<Record<string, Research>>(KEYS.research, {});
  delete research[id];
  write(KEYS.research, research);
  const story = read<Record<string, Story>>(KEYS.story, {});
  delete story[id];
  write(KEYS.story, story);
  const visual = read<Record<string, VisualMap>>(KEYS.visual, {});
  delete visual[id];
  write(KEYS.visual, visual);
  const prompts = read<Record<string, PromptPack>>(KEYS.prompts, {});
  delete prompts[id];
  write(KEYS.prompts, prompts);
  const thumbnails = read<Record<string, ThumbnailPack>>(KEYS.thumbnails, {});
  delete thumbnails[id];
  write(KEYS.thumbnails, thumbnails);
  const seo = read<Record<string, Seo>>(KEYS.seo, {});
  delete seo[id];
  write(KEYS.seo, seo);
  const rating = read<Record<string, RatingReport>>(KEYS.rating, {});
  delete rating[id];
  write(KEYS.rating, rating);
  const voice = read<Record<string, unknown>>("docos.voice", {});
  delete voice[id];
  write("docos.voice", voice);
  const pipeline = read<Record<string, unknown>>("docos.pipeline", {});
  delete pipeline[id];
  write("docos.pipeline", pipeline);
}

export function toggleFavorite(id: string) {
  write(
    KEYS.topics,
    read<Topic[]>(KEYS.topics, []).map((t) =>
      t.id === id ? { ...t, favorite: !t.favorite } : t,
    ),
  );
}

export function renameTopic(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  write(
    KEYS.topics,
    read<Topic[]>(KEYS.topics, []).map((t) =>
      t.id === id ? { ...t, topic: clean } : t,
    ),
  );
}

/** Assign a project to a folder (pass null/"" to remove from any folder). */
export function setTopicFolder(id: string, folder: string | null) {
  const clean = folder?.trim() || undefined;
  write(
    KEYS.topics,
    read<Topic[]>(KEYS.topics, []).map((t) =>
      t.id === id ? { ...t, folder: clean } : t,
    ),
  );
}

/** Delete every project and all of its generated stages. */
export function clearAllTopics() {
  const topics = read<Topic[]>(KEYS.topics, []);
  topics.forEach((t) => deleteTopic(t.id));
}

/** Delete only archived projects (handy for clearing old/test projects). */
export function clearArchivedTopics() {
  const topics = read<Topic[]>(KEYS.topics, []);
  topics.filter((t) => t.archived).forEach((t) => deleteTopic(t.id));
}

export function toggleArchived(id: string) {
  write(
    KEYS.topics,
    read<Topic[]>(KEYS.topics, []).map((t) =>
      t.id === id ? { ...t, archived: !t.archived } : t,
    ),
  );
}

/** Duplicate a project's topic metadata into a fresh project (no generated
 *  stages copied — a clean slate that keeps the idea). */
export function duplicateTopic(id: string): Topic | null {
  const topics = read<Topic[]>(KEYS.topics, []);
  const src = topics.find((t) => t.id === id);
  if (!src) return null;
  const copy: Topic = {
    ...src,
    id: crypto.randomUUID(),
    topic: `${src.topic} (copy)`,
    favorite: false,
    completed: false,
    archived: false,
    savedAt: Date.now(),
  };
  write(KEYS.topics, [copy, ...topics]);
  return copy;
}

/** Full-text search across a project's topic + stored research/story/seo. */
export function searchProject(id: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const research = read<Record<string, Research>>(KEYS.research, {})[id];
  const story = read<Record<string, Story>>(KEYS.story, {})[id];
  const seo = read<Record<string, Seo>>(KEYS.seo, {})[id];
  const haystack = [
    research ? JSON.stringify(research) : "",
    story?.script ?? "",
    seo ? JSON.stringify(seo) : "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function markCompleted(id: string, completed = true) {
  const topics = read<Topic[]>(KEYS.topics, []);
  const t = topics.find((x) => x.id === id);
  write(
    KEYS.topics,
    topics.map((x) => (x.id === id ? { ...x, completed } : x)),
  );
  if (t && completed) addTaste("completed", t.topic);
}

// ---------------- Taste Memory ----------------

const EMPTY_TASTE: TasteMemory = { liked: [], rejected: [], completed: [], highRated: [] };

export function useTaste(): TasteMemory {
  return useStored<TasteMemory>(KEYS.taste, EMPTY_TASTE);
}

export function addTaste(bucket: keyof TasteMemory, value: string) {
  const cur = read<TasteMemory>(KEYS.taste, EMPTY_TASTE);
  const list = cur[bucket] ?? [];
  if (list.includes(value)) return;
  write(KEYS.taste, { ...cur, [bucket]: [value, ...list].slice(0, 200) });
}

export function clearTaste() {
  write(KEYS.taste, EMPTY_TASTE);
}

// ---------------- Selected topic ----------------

export function useSelectedTopicId(): string | null {
  const v = useStored<string | null>(KEYS.selected, null);
  return v;
}

export function setSelectedTopicId(id: string | null) {
  write(KEYS.selected, id);
}

// ---------------- Research ----------------

export function useResearch(topicId: string | null): Research | null {
  const all = useStored<Record<string, Research>>(KEYS.research, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function saveResearch(r: Research) {
  const all = read<Record<string, Research>>(KEYS.research, {});
  all[r.topicId] = r;
  write(KEYS.research, all);
}

// ---------------- Story ----------------

export function useStory(topicId: string | null): Story | null {
  const all = useStored<Record<string, Story>>(KEYS.story, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function saveStory(s: Story) {
  const all = read<Record<string, Story>>(KEYS.story, {});
  all[s.topicId] = s;
  write(KEYS.story, all);
}

export function useAllStories(): Record<string, Story> {
  return useStored<Record<string, Story>>(KEYS.story, {});
}

// ---------------- Visual Map ----------------

export function useVisualMap(topicId: string | null): VisualMap | null {
  const all = useStored<Record<string, VisualMap>>(KEYS.visual, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function saveVisualMap(v: VisualMap) {
  const all = read<Record<string, VisualMap>>(KEYS.visual, {});
  all[v.topicId] = v;
  write(KEYS.visual, all);
}

export function useAllVisuals(): Record<string, VisualMap> {
  return useStored<Record<string, VisualMap>>(KEYS.visual, {});
}

// ---------------- Prompt Pack ----------------

export function usePromptPack(topicId: string | null): PromptPack | null {
  const all = useStored<Record<string, PromptPack>>(KEYS.prompts, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function savePromptPack(p: PromptPack) {
  const all = read<Record<string, PromptPack>>(KEYS.prompts, {});
  all[p.topicId] = p;
  write(KEYS.prompts, all);
}

// ---------------- Thumbnails ----------------

export function useThumbnails(topicId: string | null): ThumbnailPack | null {
  const all = useStored<Record<string, ThumbnailPack>>(KEYS.thumbnails, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function saveThumbnails(t: ThumbnailPack) {
  const all = read<Record<string, ThumbnailPack>>(KEYS.thumbnails, {});
  all[t.topicId] = t;
  write(KEYS.thumbnails, all);
}

// ---------------- SEO ----------------

export function useSeo(topicId: string | null): Seo | null {
  const all = useStored<Record<string, Seo>>(KEYS.seo, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function saveSeo(s: Seo) {
  const all = read<Record<string, Seo>>(KEYS.seo, {});
  all[s.topicId] = s;
  write(KEYS.seo, all);
}

// ---------------- Rating ----------------

export function useRating(topicId: string | null): RatingReport | null {
  const all = useStored<Record<string, RatingReport>>(KEYS.rating, {});
  return topicId ? (all[topicId] ?? null) : null;
}

export function saveRating(r: RatingReport) {
  const all = read<Record<string, RatingReport>>(KEYS.rating, {});
  all[r.topicId] = r;
  write(KEYS.rating, all);
}

// ---------------- Project status / export ----------------

export interface ProjectStatus {
  research: boolean;
  story: boolean;
  visual: boolean;
  prompts: boolean;
  thumbnail: boolean;
  seo: boolean;
  rating: boolean;
}

export function useProjectStatus(topicId: string | null): ProjectStatus {
  const research = useStored<Record<string, unknown>>(KEYS.research, {});
  const story = useStored<Record<string, unknown>>(KEYS.story, {});
  const visual = useStored<Record<string, unknown>>(KEYS.visual, {});
  const prompts = useStored<Record<string, unknown>>(KEYS.prompts, {});
  const thumbnails = useStored<Record<string, unknown>>(KEYS.thumbnails, {});
  const seo = useStored<Record<string, unknown>>(KEYS.seo, {});
  const rating = useStored<Record<string, unknown>>(KEYS.rating, {});
  const has = (r: Record<string, unknown>) => !!(topicId && r[topicId]);
  return {
    research: has(research),
    story: has(story),
    visual: has(visual),
    prompts: has(prompts),
    thumbnail: has(thumbnails),
    seo: has(seo),
    rating: has(rating),
  };
}

export function exportProject(topicId: string) {
  const pick = <T,>(key: string) => read<Record<string, T>>(key, {})[topicId];
  const topic = read<Topic[]>(KEYS.topics, []).find((t) => t.id === topicId);
  return {
    topic,
    research: pick<Research>(KEYS.research) ?? null,
    story: pick<Story>(KEYS.story) ?? null,
    visualMap: pick<VisualMap>(KEYS.visual) ?? null,
    promptPack: pick<PromptPack>(KEYS.prompts) ?? null,
    thumbnails: pick<ThumbnailPack>(KEYS.thumbnails) ?? null,
    seo: pick<Seo>(KEYS.seo) ?? null,
    rating: pick<RatingReport>(KEYS.rating) ?? null,
  };
}

// ---------------- Settings ----------------

export interface Settings {
  lastUniverse: string;
}

export function useSettings(): Settings {
  return useStored<Settings>(KEYS.settings, { lastUniverse: "" });
}

export function useSaveSettings() {
  return useCallback((s: Partial<Settings>) => {
    const cur = read<Settings>(KEYS.settings, { lastUniverse: "" });
    write(KEYS.settings, { ...cur, ...s });
  }, []);
}