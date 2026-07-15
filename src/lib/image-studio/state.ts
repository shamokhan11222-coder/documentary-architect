// Persistent studio state — locks, providers, settings, history.
// Stored in localStorage, refresh-safe, tab-independent.
import { useSyncExternalStore } from "react";
import type {
  BackgroundLock,
  CharacterLock,
  HistoryEntry,
  ProviderConfig,
  StudioLocks,
  StudioSettings,
  StyleLock,
} from "./types";

const K_LOCKS = "image-studio.locks.v1";
const K_PROVIDERS = "image-studio.providers.v1";
const K_SETTINGS = "image-studio.settings.v1";
const K_HISTORY = "image-studio.history.v1";

export const DEFAULT_CHARACTER: CharacterLock = {
  masterImage: null,
  name: "",
  face: true,
  body: true,
  clothes: true,
  hair: true,
  accessories: false,
  expression: false,
  style: true,
  poseFamily: false,
  notes: "",
};

export const DEFAULT_STYLE: StyleLock = {
  artStyle: "cinematic 3D animation",
  lighting: "soft cinematic",
  lineWeight: "medium",
  cameraAngle: "eye level",
  colorPalette: "warm documentary",
  backgroundStyle: "detailed environment",
  aspectRatio: "16:9",
  perspective: "third person",
};

export const DEFAULT_BG: BackgroundLock = {
  environment: "",
  weather: "",
  time: "",
  fog: "",
  snow: "",
  sky: "",
  landscape: "",
};

export const DEFAULT_LOCKS: StudioLocks = {
  character: DEFAULT_CHARACTER,
  style: DEFAULT_STYLE,
  background: DEFAULT_BG,
  enabled: true,
};

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "puter",
    name: "Puter AI",
    enabled: true,
    priority: 0,
    requiresKey: false,
    status: "ready",
    description: "Zero-key primary generator (used by the current pipeline).",
  },
  {
    id: "pollinations",
    name: "Pollinations",
    enabled: true,
    priority: 1,
    requiresKey: false,
    status: "ready",
    description: "Zero-key fallback used automatically on Puter failure.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    enabled: false,
    priority: 2,
    requiresKey: true,
    status: "needs-key",
    description: "Bring-your-own-key. Never auto-called without a saved key.",
  },
  {
    id: "gemini",
    name: "Gemini",
    enabled: false,
    priority: 3,
    requiresKey: true,
    status: "needs-key",
    description: "Bring-your-own-key Gemini image API.",
  },
  {
    id: "grok",
    name: "Grok",
    enabled: false,
    priority: 4,
    requiresKey: true,
    status: "coming-soon",
    description: "Reserved for a future Grok image provider.",
  },
  {
    id: "local-sdxl",
    name: "Local SDXL",
    enabled: false,
    priority: 5,
    requiresKey: false,
    status: "coming-soon",
    description: "Reserved for a local SDXL worker.",
  },
];

export const DEFAULT_SETTINGS: StudioSettings = {
  batchSize: 10,
  minConsistency: 80,
  autoRetry: true,
  failover: true,
  concurrency: 1,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as T) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- locks ----
let locksCache: StudioLocks | null = null;
function getLocks(): StudioLocks {
  if (!locksCache) locksCache = read(K_LOCKS, DEFAULT_LOCKS);
  return locksCache;
}
export function useStudioLocks(): StudioLocks {
  return useSyncExternalStore(subscribe, getLocks, () => DEFAULT_LOCKS);
}
export function updateLocks(patch: Partial<StudioLocks>) {
  locksCache = { ...getLocks(), ...patch };
  write(K_LOCKS, locksCache);
  emit();
}
export function updateCharacter(patch: Partial<CharacterLock>) {
  const l = getLocks();
  updateLocks({ character: { ...l.character, ...patch } });
}
export function updateStyle(patch: Partial<StyleLock>) {
  const l = getLocks();
  updateLocks({ style: { ...l.style, ...patch } });
}
export function updateBackground(patch: Partial<BackgroundLock>) {
  const l = getLocks();
  updateLocks({ background: { ...l.background, ...patch } });
}

// ---- providers ----
let providersCache: ProviderConfig[] | null = null;
function getProviders(): ProviderConfig[] {
  if (!providersCache) {
    const stored = read<ProviderConfig[]>(K_PROVIDERS, DEFAULT_PROVIDERS);
    // Merge with defaults so new providers appear on upgrade.
    const map = new Map(stored.map((p) => [p.id, p]));
    providersCache = DEFAULT_PROVIDERS.map((d) => ({ ...d, ...map.get(d.id) }));
  }
  return providersCache;
}
export function useProviders(): ProviderConfig[] {
  return useSyncExternalStore(subscribe, getProviders, () => DEFAULT_PROVIDERS);
}
export function toggleProvider(id: ProviderConfig["id"], enabled: boolean) {
  providersCache = getProviders().map((p) => (p.id === id ? { ...p, enabled } : p));
  write(K_PROVIDERS, providersCache);
  emit();
}
export function reorderProviders(order: ProviderConfig["id"][]) {
  const map = new Map(getProviders().map((p) => [p.id, p]));
  providersCache = order
    .map((id, i) => {
      const p = map.get(id);
      return p ? { ...p, priority: i } : null;
    })
    .filter(Boolean) as ProviderConfig[];
  write(K_PROVIDERS, providersCache);
  emit();
}

// ---- settings ----
let settingsCache: StudioSettings | null = null;
function getSettings(): StudioSettings {
  if (!settingsCache) settingsCache = read(K_SETTINGS, DEFAULT_SETTINGS);
  return settingsCache;
}
export function useStudioSettings(): StudioSettings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
}
export function updateSettings(patch: Partial<StudioSettings>) {
  settingsCache = { ...getSettings(), ...patch };
  write(K_SETTINGS, settingsCache);
  emit();
}

// ---- history ----
let historyCache: HistoryEntry[] | null = null;
function getHistory(): HistoryEntry[] {
  if (!historyCache) {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(K_HISTORY);
      historyCache = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      historyCache = [];
    }
  }
  return historyCache;
}
export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getHistory, () => []);
}
export function pushHistory(entry: HistoryEntry) {
  historyCache = [entry, ...getHistory()].slice(0, 200);
  write(K_HISTORY, historyCache);
  emit();
}
export function clearHistory() {
  historyCache = [];
  write(K_HISTORY, historyCache);
  emit();
}