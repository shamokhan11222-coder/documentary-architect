import { useCallback, useSyncExternalStore } from "react";
import type { PromptPack, Research, Story, Topic, VisualMap } from "./types";

const KEYS = {
  topics: "docos.topics",
  research: "docos.research",
  story: "docos.story",
  visual: "docos.visual",
  prompts: "docos.prompts",
  settings: "docos.settings",
  selected: "docos.selectedTopic",
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
  try {
    return JSON.parse(snapshot) as T;
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
}

export function toggleFavorite(id: string) {
  write(
    KEYS.topics,
    read<Topic[]>(KEYS.topics, []).map((t) =>
      t.id === id ? { ...t, favorite: !t.favorite } : t,
    ),
  );
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