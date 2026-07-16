import { useCallback, useMemo, useSyncExternalStore } from "react";
import { sanitizeNarration } from "./sanitize-narration";
import type {
  PromptPack,
  RatingReport,
  Research,
  Seo,
  StageReview,
  Story,
  TasteMemory,
  ThumbnailIdea,
  ThumbnailPack,
  Topic,
  VisualScene,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord<T = unknown>(value: unknown): Record<string, T> {
  return isRecord(value) ? (value as Record<string, T>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readArray<T>(key: string): T[] {
  return asArray<T>(read<unknown>(key, []));
}

function readRecord<T>(key: string): Record<string, T> {
  return asRecord<T>(read<unknown>(key, {}));
}

function normalizeTopic(value: unknown): Topic | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id).trim();
  if (!id) return null;
  const topic = asString(value.topic, "Untitled project").trim() || "Untitled project";
  return {
    id,
    universe: asString(value.universe, "The Hidden Origins of Everyday Life"),
    topic,
    explanation: asString(value.explanation),
    ctrScore: asNumber(value.ctrScore),
    evergreenScore: asNumber(value.evergreenScore),
    originalityScore: asNumber(value.originalityScore),
    researchDifficulty: asString(value.researchDifficulty, "Unknown"),
    visualDifficulty: asString(value.visualDifficulty, "Unknown"),
    estimatedLength: asString(value.estimatedLength, "—"),
    altTitle: asString(value.altTitle) || undefined,
    coreMystery: asString(value.coreMystery) || undefined,
    whyClick: asString(value.whyClick) || undefined,
    storyConflict: asString(value.storyConflict) || undefined,
    hookAngle: asString(value.hookAngle) || undefined,
    visualPotential: asString(value.visualPotential) || undefined,
    productionDifficulty: asString(value.productionDifficulty) || undefined,
    recommendation: asString(value.recommendation) || undefined,
    favorite: Boolean(value.favorite),
    savedAt: asNumber(value.savedAt, Date.now()),
    completed: typeof value.completed === "boolean" ? value.completed : undefined,
    archived: typeof value.archived === "boolean" ? value.archived : undefined,
    folder: asString(value.folder) || undefined,
    category: asString(value.category) || undefined,
    language: asString(value.language) || undefined,
    targetAudience: asString(value.targetAudience) || undefined,
    visualStyle: asString(value.visualStyle) || undefined,
    voiceProfileId: asString(value.voiceProfileId) || undefined,
  };
}

function normalizeReview(value: unknown): StageReview | undefined {
  if (!isRecord(value)) return undefined;
  return {
    score: asNumber(value.score),
    issues: asArray(value.issues).map((x) => asString(x)).filter(Boolean),
    verdict: asString(value.verdict),
  };
}

function normalizeResearch(value: unknown): Research | null {
  if (!isRecord(value)) return null;
  const topicId = asString(value.topicId).trim();
  if (!topicId) return null;
  const strings = (v: unknown) => asArray(v).map((x) => asString(x)).filter(Boolean);
  return {
    topicId,
    mainConflict: asString(value.mainConflict),
    timeline: strings(value.timeline),
    historicalFacts: strings(value.historicalFacts),
    scientificFacts: strings(value.scientificFacts),
    interestingFacts: strings(value.interestingFacts),
    commonMyths: strings(value.commonMyths),
    storyAngles: strings(value.storyAngles),
    unexpectedTwists: strings(value.unexpectedTwists),
    importantPeople: strings(value.importantPeople),
    importantDates: strings(value.importantDates),
    sources: strings(value.sources),
    keyTakeaways: strings(value.keyTakeaways),
    bestAngle: asString(value.bestAngle),
    endingIdea: asString(value.endingIdea),
    review: normalizeReview(value.review),
    generatedAt: asNumber(value.generatedAt, Date.now()),
  };
}

function normalizeStory(value: unknown): Story | null {
  if (!isRecord(value)) return null;
  const topicId = asString(value.topicId).trim();
  if (!topicId) return null;
  const sections = asArray<Record<string, unknown>>(value.sections)
    .map((section, index) => ({
      key: asString(section?.key, `section-${index + 1}`),
      title: asString(section?.title, `Section ${index + 1}`),
      content: asString(section?.content),
    }))
    .filter((section) => section.title || section.content);
  const script = asString(value.script) || sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n");
  return {
    topicId,
    sections,
    script,
    hookScore: asNumber(value.hookScore),
    storyScore: asNumber(value.storyScore),
    engagementScore: asNumber(value.engagementScore),
    curiosityScore: typeof value.curiosityScore === "number" ? value.curiosityScore : undefined,
    retentionScore: typeof value.retentionScore === "number" ? value.retentionScore : undefined,
    targetLabel: asString(value.targetLabel) || undefined,
    minWords: typeof value.minWords === "number" ? value.minWords : undefined,
    maxWords: typeof value.maxWords === "number" ? value.maxWords : undefined,
    review: normalizeReview(value.review),
    generatedAt: asNumber(value.generatedAt, Date.now()),
  };
}

function normalizeVisualScene(value: unknown, index: number): VisualScene | null {
  if (!isRecord(value)) return null;
  return {
    sceneNumber: asNumber(value.sceneNumber, index + 1),
    voiceoverLine: asString(value.voiceoverLine),
    visualDescription: asString(value.visualDescription),
    mainSubject: asString(value.mainSubject, "Subject"),
    background: asString(value.background, "Clean background"),
    cameraShot: asString(value.cameraShot, "Medium shot"),
    emotion: asString(value.emotion, "Neutral"),
    objectsNeeded: asArray(value.objectsNeeded).map((x) => asString(x)).filter(Boolean),
    sceneType: asString(value.sceneType, "object") as VisualScene["sceneType"],
    visualDifficulty: asString(value.visualDifficulty, "Medium"),
    notes: asString(value.notes),
  };
}

function normalizeVisualMap(value: unknown): VisualMap | null {
  if (!isRecord(value)) return null;
  const topicId = asString(value.topicId).trim();
  if (!topicId) return null;
  return {
    topicId,
    scenes: asArray(value.scenes)
      .map((scene, index) => normalizeVisualScene(scene, index))
      .filter((scene): scene is VisualScene => Boolean(scene)),
    generatedAt: asNumber(value.generatedAt, Date.now()),
  };
}

function normalizeThumbnailIdea(value: unknown): ThumbnailIdea | null {
  if (!isRecord(value)) return null;
  return {
    thumbnailTitle: asString(value.thumbnailTitle, "Untitled thumbnail"),
    mainVisualConcept: asString(value.mainVisualConcept),
    mainSubject: asString(value.mainSubject, "Subject"),
    background: asString(value.background, "Clean background"),
    emotion: asString(value.emotion, "Curious"),
    textOnThumbnail: asString(value.textOnThumbnail),
    composition: asString(value.composition),
    ctrScore: asNumber(value.ctrScore),
    whyItWorks: asString(value.whyItWorks),
    imagePrompt: asString(value.imagePrompt),
    negativePrompt: asString(value.negativePrompt),
    chosen: typeof value.chosen === "boolean" ? value.chosen : undefined,
  };
}

function normalizeThumbnailPack(value: unknown): ThumbnailPack | null {
  if (!isRecord(value)) return null;
  const topicId = asString(value.topicId).trim();
  if (!topicId) return null;
  return {
    topicId,
    ideas: asArray(value.ideas)
      .map(normalizeThumbnailIdea)
      .filter((idea): idea is ThumbnailIdea => Boolean(idea)),
    generatedAt: asNumber(value.generatedAt, Date.now()),
  };
}

function normalizeSeo(value: unknown): Seo | null {
  if (!isRecord(value)) return null;
  const topicId = asString(value.topicId).trim();
  if (!topicId) return null;
  const strings = (v: unknown) => asArray(v).map((x) => asString(x)).filter(Boolean);
  return {
    topicId,
    titleOptions: strings(value.titleOptions),
    bestTitle: asString(value.bestTitle),
    description: asString(value.description),
    tags: strings(value.tags),
    hashtags: strings(value.hashtags),
    keywords: strings(value.keywords),
    pinnedComment: asString(value.pinnedComment),
    shortSummary: asString(value.shortSummary),
    longSummary: asString(value.longSummary),
    uploadChecklist: strings(value.uploadChecklist),
    generatedAt: asNumber(value.generatedAt, Date.now()),
  };
}

function normalizeRating(value: unknown): RatingReport | null {
  if (!isRecord(value)) return null;
  const topicId = asString(value.topicId).trim();
  if (!topicId) return null;
  const strings = (v: unknown) => asArray(v).map((x) => asString(x)).filter(Boolean);
  return {
    topicId,
    hookScore: asNumber(value.hookScore),
    storyScore: asNumber(value.storyScore),
    retentionScore: asNumber(value.retentionScore),
    visualClarityScore: asNumber(value.visualClarityScore),
    thumbnailCtrScore: asNumber(value.thumbnailCtrScore),
    originalityScore: asNumber(value.originalityScore),
    evergreenScore: asNumber(value.evergreenScore),
    overallScore: asNumber(value.overallScore),
    ctrPrediction: asString(value.ctrPrediction),
    retentionPrediction: asString(value.retentionPrediction),
    weakestPart: asString(value.weakestPart),
    bestPart: asString(value.bestPart),
    weakPoints: strings(value.weakPoints),
    strongPoints: strings(value.strongPoints),
    whatToImprove: strings(value.whatToImprove),
    recommendation: asString(value.recommendation, "Needs Rewrite") as RatingReport["recommendation"],
    generatedAt: asNumber(value.generatedAt, Date.now()),
  };
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Never let a storage-quota failure crash a save or corrupt other keys.
    console.error(`Failed to persist "${key}" — storage may be full.`, err);
    return;
  }
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
  const raw = useStored<unknown>(KEYS.topics, []);
  return useMemo(
    () => asArray(raw).map(normalizeTopic).filter((topic): topic is Topic => Boolean(topic)),
    [raw],
  );
}

export function saveTopic(t: Omit<Topic, "id" | "favorite" | "savedAt">): Topic {
  const topics = readArray<Topic>(KEYS.topics).map(normalizeTopic).filter((x): x is Topic => Boolean(x));
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
      readArray<Topic>(KEYS.topics).filter((t) => t.id !== id),
  );
  const research = readRecord<Research>(KEYS.research);
  delete research[id];
  write(KEYS.research, research);
  const story = readRecord<Story>(KEYS.story);
  delete story[id];
  write(KEYS.story, story);
  const visual = readRecord<VisualMap>(KEYS.visual);
  delete visual[id];
  write(KEYS.visual, visual);
  const prompts = readRecord<PromptPack>(KEYS.prompts);
  delete prompts[id];
  write(KEYS.prompts, prompts);
  const thumbnails = readRecord<ThumbnailPack>(KEYS.thumbnails);
  delete thumbnails[id];
  write(KEYS.thumbnails, thumbnails);
  const seo = readRecord<Seo>(KEYS.seo);
  delete seo[id];
  write(KEYS.seo, seo);
  const rating = readRecord<RatingReport>(KEYS.rating);
  delete rating[id];
  write(KEYS.rating, rating);
  const voice = readRecord<unknown>("docos.voice");
  delete voice[id];
  write("docos.voice", voice);
  const pipeline = readRecord<unknown>("docos.pipeline");
  delete pipeline[id];
  write("docos.pipeline", pipeline);
}

export function toggleFavorite(id: string) {
  write(
    KEYS.topics,
    readArray<Topic>(KEYS.topics).map((t) =>
      t.id === id ? { ...t, favorite: !t.favorite } : t,
    ),
  );
}

export function renameTopic(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  write(
    KEYS.topics,
    readArray<Topic>(KEYS.topics).map((t) =>
      t.id === id ? { ...t, topic: clean } : t,
    ),
  );
}

/** Assign a project to a folder (pass null/"" to remove from any folder). */
export function setTopicFolder(id: string, folder: string | null) {
  const clean = folder?.trim() || undefined;
  write(
    KEYS.topics,
    readArray<Topic>(KEYS.topics).map((t) =>
      t.id === id ? { ...t, folder: clean } : t,
    ),
  );
}

/** Delete every project and all of its generated stages. */
export function clearAllTopics() {
  const topics = readArray<Topic>(KEYS.topics);
  topics.forEach((t) => deleteTopic(t.id));
}

/** Delete only archived projects (handy for clearing old/test projects). */
export function clearArchivedTopics() {
  const topics = readArray<Topic>(KEYS.topics);
  topics.filter((t) => t.archived).forEach((t) => deleteTopic(t.id));
}

export function toggleArchived(id: string) {
  write(
    KEYS.topics,
    readArray<Topic>(KEYS.topics).map((t) =>
      t.id === id ? { ...t, archived: !t.archived } : t,
    ),
  );
}

/** Duplicate a project's topic metadata into a fresh project (no generated
 *  stages copied — a clean slate that keeps the idea). */
export function duplicateTopic(id: string): Topic | null {
  const topics = readArray<Topic>(KEYS.topics);
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
  const research = readRecord<Research>(KEYS.research)[id];
  const story = readRecord<Story>(KEYS.story)[id];
  const seo = readRecord<Seo>(KEYS.seo)[id];
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
  const topics = readArray<Topic>(KEYS.topics);
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
  const cur = { ...EMPTY_TASTE, ...asRecord(read<unknown>(KEYS.taste, EMPTY_TASTE)) } as TasteMemory;
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
  const all = useStored<unknown>(KEYS.research, {});
  return useMemo(() => (topicId ? normalizeResearch(asRecord(all)[topicId]) : null), [all, topicId]);
}

export function saveResearch(r: Research) {
  const all = readRecord<Research>(KEYS.research);
  all[r.topicId] = r;
  write(KEYS.research, all);
}

// ---------------- Story ----------------

export function useStory(topicId: string | null): Story | null {
  const all = useStored<unknown>(KEYS.story, {});
  return useMemo(() => (topicId ? normalizeStory(asRecord(all)[topicId]) : null), [all, topicId]);
}

export function saveStory(s: Story) {
  // Sanitize narration text at the persistence boundary so nothing downstream
  // (TTS, sync, export) ever sees zero-width / control / replacement chars.
  if (typeof s.script === "string") s = { ...s, script: sanitizeNarration(s.script) };
  const all = readRecord<Story>(KEYS.story);
  all[s.topicId] = s;
  write(KEYS.story, all);
}

export function useAllStories(): Record<string, Story> {
  const all = useStored<unknown>(KEYS.story, {});
  return useMemo(() => {
    const out: Record<string, Story> = {};
    Object.entries(asRecord(all)).forEach(([key, value]) => {
      const story = normalizeStory(value);
      if (story) out[key] = story;
    });
    return out;
  }, [all]);
}

// ---------------- Visual Map ----------------

export function useVisualMap(topicId: string | null): VisualMap | null {
  const all = useStored<unknown>(KEYS.visual, {});
  return useMemo(() => (topicId ? normalizeVisualMap(asRecord(all)[topicId]) : null), [all, topicId]);
}

export function saveVisualMap(v: VisualMap) {
  const all = readRecord<VisualMap>(KEYS.visual);
  all[v.topicId] = v;
  write(KEYS.visual, all);
}

export function useAllVisuals(): Record<string, VisualMap> {
  const all = useStored<unknown>(KEYS.visual, {});
  return useMemo(() => {
    const out: Record<string, VisualMap> = {};
    Object.entries(asRecord(all)).forEach(([key, value]) => {
      const visual = normalizeVisualMap(value);
      if (visual) out[key] = visual;
    });
    return out;
  }, [all]);
}

// ---------------- Prompt Pack ----------------

export function usePromptPack(topicId: string | null): PromptPack | null {
  const all = useStored<unknown>(KEYS.prompts, {});
  return topicId ? (asRecord<PromptPack>(all)[topicId] ?? null) : null;
}

export function savePromptPack(p: PromptPack) {
  const all = readRecord<PromptPack>(KEYS.prompts);
  all[p.topicId] = p;
  write(KEYS.prompts, all);
}

// ---------------- Thumbnails ----------------

export function useThumbnails(topicId: string | null): ThumbnailPack | null {
  const all = useStored<unknown>(KEYS.thumbnails, {});
  return useMemo(() => (topicId ? normalizeThumbnailPack(asRecord(all)[topicId]) : null), [all, topicId]);
}

export function saveThumbnails(t: ThumbnailPack) {
  const all = readRecord<ThumbnailPack>(KEYS.thumbnails);
  all[t.topicId] = t;
  write(KEYS.thumbnails, all);
}

// ---------------- SEO ----------------

export function useSeo(topicId: string | null): Seo | null {
  const all = useStored<unknown>(KEYS.seo, {});
  return useMemo(() => (topicId ? normalizeSeo(asRecord(all)[topicId]) : null), [all, topicId]);
}

export function saveSeo(s: Seo) {
  const all = readRecord<Seo>(KEYS.seo);
  all[s.topicId] = s;
  write(KEYS.seo, all);
}

// ---------------- Rating ----------------

export function useRating(topicId: string | null): RatingReport | null {
  const all = useStored<unknown>(KEYS.rating, {});
  return useMemo(() => (topicId ? normalizeRating(asRecord(all)[topicId]) : null), [all, topicId]);
}

export function saveRating(r: RatingReport) {
  const all = readRecord<RatingReport>(KEYS.rating);
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
  const pick = <T,>(key: string) => readRecord<T>(key)[topicId];
  const topic = readArray<Topic>(KEYS.topics).find((t) => t.id === topicId);
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