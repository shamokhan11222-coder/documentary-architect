// V6 Production Studio store — voice, subtitles, image queue, audio suggestions.
// Persisted in localStorage per project so nothing is lost between sessions.
import { useSyncExternalStore } from "react";
import type {
  AudioPack,
  ProjectQueue,
  QueueItem,
  Subtitle,
  SubtitlePack,
  VoiceProject,
  VoiceProfile,
  VoiceSettings,
} from "./types";

const KEYS = {
  voice: "docos.voice",
  subtitles: "docos.subtitles",
  queue: "docos.queue",
  audio: "docos.audio",
  voiceProfiles: "docos.voiceProfiles",
} as const;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
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
  const snap = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? "",
    () => "",
  );
  if (!snap) return fallback;
  try {
    return JSON.parse(snap) as T;
  } catch {
    return fallback;
  }
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  profile: "deep",
  voiceName: "Narrator",
  speed: 1,
  stability: 0.6,
  emotion: 0.4,
  pauseStrength: 0.5,
  pitch: 0.5,
  dictionary: [],
};

// ---------------- Voice ----------------

export function useVoice(topicId: string | null): VoiceProject | null {
  const all = useStored<Record<string, VoiceProject>>(KEYS.voice, {});
  return topicId ? (all[topicId] ?? null) : null;
}
export function saveVoice(v: VoiceProject) {
  const all = read<Record<string, VoiceProject>>(KEYS.voice, {});
  all[v.topicId] = v;
  write(KEYS.voice, all);
}

// ---------------- Cloned Voice Profiles (global) ----------------

export function useVoiceProfiles(): VoiceProfile[] {
  return useStored<VoiceProfile[]>(KEYS.voiceProfiles, []);
}
export function saveVoiceProfile(p: VoiceProfile) {
  const all = read<VoiceProfile[]>(KEYS.voiceProfiles, []);
  write(KEYS.voiceProfiles, [p, ...all.filter((x) => x.id !== p.id)]);
}
export function deleteVoiceProfile(id: string) {
  write(
    KEYS.voiceProfiles,
    read<VoiceProfile[]>(KEYS.voiceProfiles, []).filter((x) => x.id !== id),
  );
}

/** Non-reactive read — safe inside event handlers / generation helpers. */
export function readVoiceProfiles(): VoiceProfile[] {
  return read<VoiceProfile[]>(KEYS.voiceProfiles, []);
}
export function getVoiceProfile(id: string | null | undefined): VoiceProfile | null {
  if (!id) return null;
  return read<VoiceProfile[]>(KEYS.voiceProfiles, []).find((x) => x.id === id) ?? null;
}
export function updateVoiceProfile(id: string, patch: Partial<VoiceProfile>) {
  const all = read<VoiceProfile[]>(KEYS.voiceProfiles, []);
  write(
    KEYS.voiceProfiles,
    all.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)),
  );
}
export function renameVoiceProfile(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  updateVoiceProfile(id, { name: clean });
}
/** Mark one profile as the default and clear the flag on every other one. */
export function setDefaultVoiceProfile(id: string) {
  const all = read<VoiceProfile[]>(KEYS.voiceProfiles, []);
  write(
    KEYS.voiceProfiles,
    all.map((x) => ({ ...x, isDefault: x.id === id })),
  );
}

// ---------------- Subtitles ----------------

export function useSubtitles(topicId: string | null): SubtitlePack | null {
  const all = useStored<Record<string, SubtitlePack>>(KEYS.subtitles, {});
  return topicId ? (all[topicId] ?? null) : null;
}
export function saveSubtitles(s: SubtitlePack) {
  const all = read<Record<string, SubtitlePack>>(KEYS.subtitles, {});
  all[s.topicId] = s;
  write(KEYS.subtitles, all);
}

// ---------------- Image Queue ----------------

export function useQueue(topicId: string | null): ProjectQueue | null {
  const all = useStored<Record<string, ProjectQueue>>(KEYS.queue, {});
  return topicId ? (all[topicId] ?? null) : null;
}
export function saveQueue(q: ProjectQueue) {
  const all = read<Record<string, ProjectQueue>>(KEYS.queue, {});
  all[q.topicId] = { ...q, updatedAt: Date.now() };
  write(KEYS.queue, all);
}
export function readQueue(topicId: string): ProjectQueue | null {
  return read<Record<string, ProjectQueue>>(KEYS.queue, {})[topicId] ?? null;
}
export function setQueueItem(topicId: string, item: QueueItem) {
  const all = read<Record<string, ProjectQueue>>(KEYS.queue, {});
  const q = all[topicId];
  if (!q) return;
  q.items = q.items.map((i) => (i.sceneNumber === item.sceneNumber ? item : i));
  q.updatedAt = Date.now();
  write(KEYS.queue, all);
}

// ---------------- Audio suggestions ----------------

export function useAudioPack(topicId: string | null): AudioPack | null {
  const all = useStored<Record<string, AudioPack>>(KEYS.audio, {});
  return topicId ? (all[topicId] ?? null) : null;
}
export function saveAudioPack(a: AudioPack) {
  const all = read<Record<string, AudioPack>>(KEYS.audio, {});
  all[a.topicId] = a;
  write(KEYS.audio, all);
}

// ---------------- Helpers ----------------

const WORDS_PER_SECOND = 2.5;

export function estimateSeconds(text: string): number {
  const words = (typeof text === "string" ? text.match(/\S+/g) ?? [] : []).length;
  return Math.max(1, Math.round(words / WORDS_PER_SECOND));
}

/** Split a story script into narration paragraphs, dropping "## Title" headings. */
export function scriptToParagraphs(script: string): string[] {
  if (typeof script !== "string") return [];
  return script
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, "").trim())
    .filter((p) => p.length > 0);
}

/** Build subtitle cues from paragraphs using estimated speaking rate. */
export function buildSubtitles(paragraphs: string[]): Subtitle[] {
  const cues: Subtitle[] = [];
  let t = 0;
  let index = 1;
  for (const para of paragraphs) {
    // split long paragraphs into ~ one-sentence cues
    const sentences = para.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [para];
    for (const s of sentences) {
      const dur = estimateSeconds(s);
      cues.push({ index: index++, start: t, end: t + dur, duration: dur, text: s });
      t += dur;
    }
  }
  return cues;
}

export function fmtTimestamp(sec: number, sep = ","): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`;
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function toSRT(cues: Subtitle[]): string {
  return cues
    .map((c) => `${c.index}\n${fmtTimestamp(c.start)} --> ${fmtTimestamp(c.end)}\n${c.text}`)
    .join("\n\n");
}
export function toVTT(cues: Subtitle[]): string {
  return (
    "WEBVTT\n\n" +
    cues
      .map((c) => `${fmtTimestamp(c.start, ".")} --> ${fmtTimestamp(c.end, ".")}\n${c.text}`)
      .join("\n\n")
  );
}
export function toPlainText(cues: Subtitle[]): string {
  return cues.map((c) => c.text).join("\n");
}
