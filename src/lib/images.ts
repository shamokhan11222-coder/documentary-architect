// IndexedDB-backed image store. Generated storyboard/thumbnail images and
// Visual DNA reference images are far too large for localStorage, so they live
// here as data URLs keyed by a stable id.
import { useSyncExternalStore } from "react";

const DB_NAME = "docos-images";
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

// ---- synchronous id index (localStorage) ----
// IndexedDB reads are async, but the pipeline's stageDone() checks need a
// synchronous "does an image/audio asset exist for this topic?" answer. We
// mirror the set of stored ids into localStorage so completion can be
// validated without awaiting IndexedDB.
const INDEX_KEY = "docos.imageIndex";

function readIndex(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* ignore quota */
  }
}

function addToIndex(id: string) {
  const ids = readIndex();
  if (!ids.includes(id)) writeIndex([...ids, id]);
}

function removeFromIndex(id: string) {
  writeIndex(readIndex().filter((x) => x !== id));
}

/** Synchronous check: is any stored asset id present with this prefix? */
export function hasStoredIdWithPrefix(prefix: string): boolean {
  return readIndex().some((id) => id.startsWith(prefix));
}

/** Backfill the sync index from IndexedDB keys (for assets stored before the
 *  index existed). Safe to call multiple times. */
export async function syncImageIndex(): Promise<void> {
  try {
    const db = await openDb();
    const keys = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => reject(req.error);
    });
    writeIndex(Array.from(new Set([...readIndex(), ...keys])));
    bump();
  } catch {
    /* ignore */
  }
}

// Run the backfill once on the client so pre-index assets are recognized.
if (typeof window !== "undefined") {
  void syncImageIndex();
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no idb"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ---- change notification ----
const listeners = new Set<() => void>();
let version = 0;
function bump() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// small in-memory cache so the hook can return synchronously after first load
const cache = new Map<string, string | null>();

export async function putImage(id: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  cache.set(id, dataUrl);
  addToIndex(id);
  bump();
}

export async function loadImage(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
  cache.set(id, null);
  removeFromIndex(id);
  bump();
}

/** React hook returning the data URL for an image id (or null while loading/absent). */
export function useImage(id: string | null): string | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  if (!id) return null;
  if (!cache.has(id)) {
    cache.set(id, null);
    void loadImage(id).then((v) => {
      cache.set(id, v);
      bump();
    });
  }
  return cache.get(id) ?? null;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}