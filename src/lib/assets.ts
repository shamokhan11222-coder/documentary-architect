// Permanent, GLOBAL Assets Library — reusable across every project.
// Metadata lives in localStorage; the binary data URL lives in IndexedDB.
import { useSyncExternalStore } from "react";
import { putImage, deleteImage } from "./images";
import type { AssetCategory, AssetMeta } from "./types";

export const ASSET_CATEGORIES: AssetCategory[] = [
  "Stickman",
  "Expressions",
  "Objects",
  "Maps",
  "Arrows",
  "Backgrounds",
  "Icons",
  "Props",
  "Music",
  "Sound Effects",
];

const KEY = "docos.assets";

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}
function read(): AssetMeta[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as AssetMeta[];
  } catch {
    return [];
  }
}
function write(list: AssetMeta[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export function useAssets(): AssetMeta[] {
  const snap = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) ?? "[]",
    () => "[]",
  );
  try {
    return JSON.parse(snap) as AssetMeta[];
  } catch {
    return [];
  }
}

export const assetImageId = (id: string) => `asset:${id}`;

export async function addAsset(
  name: string,
  category: AssetCategory,
  dataUrl: string,
  kind: AssetMeta["kind"],
) {
  const id = crypto.randomUUID();
  await putImage(assetImageId(id), dataUrl);
  write([{ id, name, category, kind, addedAt: Date.now() }, ...read()]);
}

export async function removeAsset(id: string) {
  await deleteImage(assetImageId(id));
  write(read().filter((a) => a.id !== id));
}
