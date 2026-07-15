// Reference Studio — Whisk-style reference image system.
//
// State model:
//   - Reference cards (id, category, weight, active, notes, fileName)
//     are stored per-project in localStorage.
//   - The actual image bytes live in IndexedDB (via images.ts) under
//     `ref:${id}` so they survive refresh and never bloat localStorage.
//   - Subject profile, image mode ('free' | 'reference'), selected
//     adapter, and the five approval tests are also per-project.
//
// Nothing here calls a network provider — this is pure state + persistence.
import { useSyncExternalStore } from "react";
import { putImage, deleteImage, loadImage } from "@/lib/images";

export type RefCategory = "subject" | "style" | "environment" | "composition";
export type RefWeight = "low" | "medium" | "high";
export type ImageMode = "free" | "reference";
export type TestStatus =
  | "pending"
  | "running"
  | "approved"
  | "rejected"
  | "wrong-subject"
  | "wrong-style"
  | "wrong-environment";

export interface ReferenceCard {
  id: string;
  category: RefCategory;
  fileName: string;
  weight: RefWeight;
  active: boolean;
  notes: string;
  addedAt: number;
}

export interface SubjectProfile {
  name: string;
  species: string;
  age: string;
  traits: string[];
  lockSpecies: boolean;
  lockAge: boolean;
  lockFurColor: boolean;
  lockFace: boolean;
  lockBodyProportions: boolean;
}

export interface ReferenceTest {
  id: string;
  index: number;
  label: string;
  prompt: string;
  imageId: string | null;
  status: TestStatus;
  provider: string | null;
  error?: string;
  ranAt?: number;
}

export interface ReferenceState {
  mode: ImageMode;
  adapterId: string; // reference-mode adapter id, e.g. "lovable-gateway"
  cards: ReferenceCard[];
  subject: SubjectProfile;
  tests: ReferenceTest[];
}

export const REF_CAPS: Record<RefCategory, number> = {
  subject: 4,
  style: 4,
  environment: 4,
  composition: 2,
};

export const DEFAULT_WEIGHTS: Record<RefCategory, RefWeight> = {
  subject: "high",
  style: "high",
  environment: "medium",
  composition: "medium",
};

export const DEFAULT_SUBJECT: SubjectProfile = {
  name: "",
  species: "",
  age: "",
  traits: [],
  lockSpecies: true,
  lockAge: true,
  lockFurColor: true,
  lockFace: true,
  lockBodyProportions: true,
};

export const DEFAULT_TESTS: Omit<ReferenceTest, "id">[] = [
  { index: 1, label: "Snow den",          prompt: "Cub inside a snow den, soft ambient light, close view.",                imageId: null, status: "pending", provider: null },
  { index: 2, label: "Walking with mother", prompt: "Cub walking beside its mother across snow, mid shot.",                 imageId: null, status: "pending", provider: null },
  { index: 3, label: "Crossing sea ice",  prompt: "Cub crossing cracked sea ice under a pale sky, wide shot.",             imageId: null, status: "pending", provider: null },
  { index: 4, label: "Snowstorm",         prompt: "Cub braving a heavy snowstorm, wind-blown fur, moody light.",           imageId: null, status: "pending", provider: null },
  { index: 5, label: "Sunset rest",       prompt: "Cub resting on ice at sunset, warm rim light, calm composition.",       imageId: null, status: "pending", provider: null },
];

const STATE_KEY_PREFIX = "docos.refstudio.v1:";
const stateKey = (projectId: string | null) => `${STATE_KEY_PREFIX}${projectId ?? "none"}`;
const refImageId = (id: string) => `ref:${id}`;

function defaultState(): ReferenceState {
  return {
    mode: "free",
    adapterId: "lovable-gateway",
    cards: [],
    subject: { ...DEFAULT_SUBJECT, traits: [] },
    tests: DEFAULT_TESTS.map((t) => ({ ...t, id: `t-${t.index}` })),
  };
}

// ---- reactive store ----
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

function read(projectId: string | null): ReferenceState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(stateKey(projectId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ReferenceState>;
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      subject: { ...base.subject, ...(parsed.subject ?? {}) },
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      tests: Array.isArray(parsed.tests) && parsed.tests.length === 5
        ? parsed.tests
        : base.tests,
    };
  } catch {
    return defaultState();
  }
}

function write(projectId: string | null, state: ReferenceState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(stateKey(projectId), JSON.stringify(state));
  } catch (err) {
    console.error("Reference Studio: persist failed", err);
  }
  emit();
}

export function useReferenceState(projectId: string | null): ReferenceState {
  const snap = useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" ? localStorage.getItem(stateKey(projectId)) ?? "" : ""),
    () => "",
  );
  if (!snap) return defaultState();
  return read(projectId);
}

export function getReferenceState(projectId: string | null): ReferenceState {
  return read(projectId);
}

// ---- mode / adapter ----
export function setImageMode(projectId: string | null, mode: ImageMode) {
  const s = read(projectId);
  write(projectId, { ...s, mode });
}
export function setAdapterId(projectId: string | null, adapterId: string) {
  const s = read(projectId);
  write(projectId, { ...s, adapterId });
}

// ---- subject profile ----
export function updateSubject(projectId: string | null, patch: Partial<SubjectProfile>) {
  const s = read(projectId);
  write(projectId, { ...s, subject: { ...s.subject, ...patch } });
}

// ---- cards ----
export async function addReferenceCard(
  projectId: string | null,
  category: RefCategory,
  file: File,
  dataUrl: string,
): Promise<ReferenceCard | null> {
  const s = read(projectId);
  const same = s.cards.filter((c) => c.category === category);
  if (same.length >= REF_CAPS[category]) return null;
  const card: ReferenceCard = {
    id: crypto.randomUUID(),
    category,
    fileName: file.name || `${category}.png`,
    weight: DEFAULT_WEIGHTS[category],
    active: true,
    notes: "",
    addedAt: Date.now(),
  };
  await putImage(refImageId(card.id), dataUrl);
  write(projectId, { ...s, cards: [card, ...s.cards] });
  return card;
}

export async function removeReferenceCard(projectId: string | null, id: string) {
  const s = read(projectId);
  await deleteImage(refImageId(id)).catch(() => {});
  write(projectId, { ...s, cards: s.cards.filter((c) => c.id !== id) });
}

export async function replaceReferenceImage(
  projectId: string | null,
  id: string,
  file: File,
  dataUrl: string,
) {
  const s = read(projectId);
  const card = s.cards.find((c) => c.id === id);
  if (!card) return;
  await putImage(refImageId(id), dataUrl);
  write(projectId, {
    ...s,
    cards: s.cards.map((c) => (c.id === id ? { ...c, fileName: file.name || c.fileName } : c)),
  });
}

export function updateReferenceCard(
  projectId: string | null,
  id: string,
  patch: Partial<Pick<ReferenceCard, "active" | "weight" | "notes">>,
) {
  const s = read(projectId);
  write(projectId, {
    ...s,
    cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
}

export function referenceImageId(id: string) {
  return refImageId(id);
}

export async function loadReferenceImage(id: string): Promise<string | null> {
  return loadImage(refImageId(id));
}

// ---- tests ----
export function updateTest(projectId: string | null, testId: string, patch: Partial<ReferenceTest>) {
  const s = read(projectId);
  write(projectId, {
    ...s,
    tests: s.tests.map((t) => (t.id === testId ? { ...t, ...patch } : t)),
  });
}

export function resetTests(projectId: string | null) {
  const s = read(projectId);
  const fresh = DEFAULT_TESTS.map((t) => ({ ...t, id: `t-${t.index}` }));
  // Best-effort: forget old test images from IDB.
  for (const t of s.tests) if (t.imageId) void deleteImage(t.imageId).catch(() => {});
  write(projectId, { ...s, tests: fresh });
}

export function approvedTestCount(state: ReferenceState): number {
  return state.tests.filter((t) => t.status === "approved").length;
}

export function fullQueueUnlocked(state: ReferenceState): boolean {
  return state.mode === "free" || approvedTestCount(state) >= 4;
}

// ---- selectors ----
export function activeCards(state: ReferenceState, category?: RefCategory): ReferenceCard[] {
  return state.cards
    .filter((c) => c.active && (!category || c.category === category))
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function collectActiveReferences(state: ReferenceState): Promise<{
  subject: string[];
  style: string[];
  environment: string[];
  composition: string[];
  all: string[];
}> {
  const out = { subject: [] as string[], style: [] as string[], environment: [] as string[], composition: [] as string[] };
  for (const c of state.cards) {
    if (!c.active) continue;
    const img = await loadImage(refImageId(c.id));
    if (!img) continue;
    out[c.category].push(img);
  }
  return { ...out, all: [...out.subject, ...out.style, ...out.environment, ...out.composition] };
}