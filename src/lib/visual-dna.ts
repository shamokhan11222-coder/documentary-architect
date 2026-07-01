// Visual DNA — permanent, GLOBAL reference images used by every project so that
// the character, style, colors etc. stay perfectly consistent forever.
import { useSyncExternalStore } from "react";
import { putImage, deleteImage, loadImage } from "./images";

export const DNA_SLOTS = [
  { key: "character", label: "Reference Character (Stickman)" },
  { key: "style", label: "Reference Style" },
  { key: "background", label: "Reference Background Style" },
  { key: "palette", label: "Reference Color Palette" },
  { key: "objects", label: "Reference Objects" },
  { key: "expressions", label: "Reference Expressions" },
  { key: "lines", label: "Reference Line Style" },
  { key: "camera", label: "Reference Camera Style" },
] as const;

export type DnaKey = (typeof DNA_SLOTS)[number]["key"];

const INDEX_KEY = "docos.dna.index";
const imageId = (k: DnaKey) => `dna:${k}`;

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}
function readIndex(): DnaKey[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as DnaKey[];
  } catch {
    return [];
  }
}
function writeIndex(keys: DnaKey[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(keys));
  listeners.forEach((l) => l());
}

/** Which DNA slots currently have an image. */
export function useDnaIndex(): DnaKey[] {
  const snap = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(INDEX_KEY) ?? "[]",
    () => "[]",
  );
  try {
    return JSON.parse(snap) as DnaKey[];
  } catch {
    return [];
  }
}

export async function setDna(key: DnaKey, dataUrl: string) {
  await putImage(imageId(key), dataUrl);
  const idx = readIndex();
  if (!idx.includes(key)) writeIndex([...idx, key]);
  else listeners.forEach((l) => l());
}

export async function clearDna(key: DnaKey) {
  await deleteImage(imageId(key));
  writeIndex(readIndex().filter((k) => k !== key));
}

export function dnaImageId(key: DnaKey) {
  return imageId(key);
}

/** Collect all set DNA reference images (for feeding into image generation). */
export async function collectDnaReferences(): Promise<{ hasCharacter: boolean; images: string[] }> {
  const idx = readIndex();
  const images: string[] = [];
  for (const k of idx) {
    const img = await loadImage(imageId(k));
    if (img) images.push(img);
  }
  return { hasCharacter: idx.includes("character"), images };
}