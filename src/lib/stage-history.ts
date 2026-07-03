// Generic per-stage edit history (undo / redo / autosave) for the studio
// pipeline. Snapshots the selected project's slice of a stage's stored data
// so every stage shares ONE history model.
import { useCallback, useEffect, useRef, useState } from "react";

export type StageId =
  | "research"
  | "story"
  | "visual"
  | "thumbnail"
  | "voice"
  | "seo"
  | "rating";

const DATA_KEY: Record<StageId, string> = {
  research: "docos.research",
  story: "docos.story",
  visual: "docos.visual",
  thumbnail: "docos.thumbnails",
  voice: "docos.voice",
  seo: "docos.seo",
  rating: "docos.rating",
};

const MAX = 60;

export interface HistoryEntry {
  at: number;
  json: string;
  label: string;
}

function readSlice(stage: StageId, topicId: string): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(DATA_KEY[stage]);
    if (!raw) return "null";
    const map = JSON.parse(raw) as Record<string, unknown>;
    return JSON.stringify(map[topicId] ?? null);
  } catch {
    return "null";
  }
}

function writeSlice(stage: StageId, topicId: string, json: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(DATA_KEY[stage]);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    map[topicId] = json ? JSON.parse(json) : null;
    localStorage.setItem(DATA_KEY[stage], JSON.stringify(map));
    // Notify every reactive store subscriber (store.ts + local.ts listen on
    // window "storage"). Same-tab writes need this manual dispatch.
    window.dispatchEvent(new Event("storage"));
  } catch {
    /* ignore */
  }
}

export interface StageHistory {
  entries: HistoryEntry[];
  index: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  jumpTo: (i: number) => void;
  savedAt: number | null;
}

export function useStageHistory(stage: StageId, topicId: string | null): StageHistory {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [index, setIndex] = useState(-1);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const indexRef = useRef(-1);
  const restoring = useRef(false);
  indexRef.current = index;

  const key = topicId ? `${stage}:${topicId}` : "";

  // Reset the timeline when the stage or project changes.
  useEffect(() => {
    if (!topicId) {
      setEntries([]);
      setIndex(-1);
      setSavedAt(null);
      return;
    }
    const initial = readSlice(stage, topicId);
    setEntries([{ at: Date.now(), json: initial, label: "Opened" }]);
    setIndex(0);
    setSavedAt(initial && initial !== "null" ? Date.now() : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Watch for edits (autosave). Store writes emit only in-tab, so poll plus
  // listen on the synthetic storage event for responsiveness.
  useEffect(() => {
    if (!topicId) return;
    let last = readSlice(stage, topicId);
    const check = () => {
      const cur = readSlice(stage, topicId);
      if (cur === last) return;
      last = cur;
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      setEntries((prev) => {
        const trimmed = prev.slice(0, indexRef.current + 1);
        const next = [...trimmed, { at: Date.now(), json: cur, label: "Autosaved" }].slice(-MAX);
        indexRef.current = next.length - 1;
        setIndex(next.length - 1);
        return next;
      });
      setSavedAt(Date.now());
    };
    window.addEventListener("storage", check);
    const iv = window.setInterval(check, 700);
    return () => {
      window.removeEventListener("storage", check);
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const restore = useCallback(
    (i: number) => {
      if (!topicId || i < 0 || i >= entries.length) return;
      restoring.current = true;
      writeSlice(stage, topicId, entries[i].json);
      indexRef.current = i;
      setIndex(i);
      setSavedAt(Date.now());
    },
    [entries, stage, topicId],
  );

  const undo = useCallback(() => restore(index - 1), [restore, index]);
  const redo = useCallback(() => restore(index + 1), [restore, index]);

  return {
    entries,
    index,
    canUndo: index > 0,
    canRedo: index >= 0 && index < entries.length - 1,
    undo,
    redo,
    jumpTo: restore,
    savedAt,
  };
}
