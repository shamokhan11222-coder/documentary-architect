// Gemini image key pool + rotation.
//
// Image generation runs on Gemini ONLY (no OpenAI, no built-in AI). This module
// stores multiple Gemini image API keys and rotates through them automatically:
// before every image request we pick the first key that is not cooling down, and
// when a key hits RESOURCE_EXHAUSTED / quota / rate-limit we cool it down with an
// escalating schedule and move to the next key. Invalid keys / missing models are
// disabled and skipped. State is persisted in localStorage (per browser).
import { readLocal, writeLocal, useLocal } from "./local";
import { GEMINI_FORCED_IMAGE_MODEL, normalizeGeminiModel } from "./gemini-model";

const KEY = "docos.gemini.imageKeys";

export type GeminiKeyStatus = "active" | "cooling" | "disabled";

export interface GeminiImageKey {
  id: string;
  name: string;
  key: string;
  status: GeminiKeyStatus;
  lastUsed: number | null;
  failCount: number;      // consecutive limit errors (drives cooldown escalation)
  cooldownUntil: number | null;
  disabledReason?: string | null;
  imageModel?: string;    // optional per-key image model override
}

// Escalating cooldown schedule per requirement 7.
const COOLDOWN_MS = {
  first: 10 * 60 * 1000,   // 10 minutes
  second: 30 * 60 * 1000,  // 30 minutes
  third: 2 * 60 * 60 * 1000, // 2 hours
};

function msUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
  return tomorrow.getTime() - now.getTime();
}

function read(): GeminiImageKey[] {
  return reconcileModels(readLocal<GeminiImageKey[]>(KEY, []));
}

function write(list: GeminiImageKey[]) {
  writeLocal(KEY, list);
}

/** Reactive hook. Auto-reactivates any key whose cooldown has expired. */
export function useGeminiImageKeys(): GeminiImageKey[] {
  return reconcile(useLocal<GeminiImageKey[]>(KEY, []));
}

export function getGeminiImageKeys(): GeminiImageKey[] {
  return reconcile(read());
}

/** Flip cooling keys back to active once their cooldown window has passed. */
function reconcile(list: GeminiImageKey[]): GeminiImageKey[] {
  const now = Date.now();
  let changed = false;
  const next = reconcileModels(list).map((k) => {
    if (k.status === "cooling" && k.cooldownUntil != null && k.cooldownUntil <= now) {
      changed = true;
      return { ...k, status: "active" as GeminiKeyStatus, cooldownUntil: null };
    }
    return k;
  });
  if (changed) write(next);
  return next;
}

function reconcileModels(list: GeminiImageKey[]): GeminiImageKey[] {
  return list.map((k) => ({ ...k, imageModel: normalizeGeminiModel(k.imageModel) || GEMINI_FORCED_IMAGE_MODEL }));
}

export function addGeminiImageKey(name: string, key: string, imageModel?: string) {
  const list = read();
  const entry: GeminiImageKey = {
    id: crypto.randomUUID(),
    name: name.trim() || `Gemini Key ${list.length + 1}`,
    key: key.trim(),
    status: "active",
    lastUsed: null,
    failCount: 0,
    cooldownUntil: null,
    imageModel: normalizeGeminiModel(imageModel) || GEMINI_FORCED_IMAGE_MODEL,
  };
  write([...list, entry]);
  return entry;
}

export function updateGeminiImageKey(id: string, patch: Partial<GeminiImageKey>) {
  write(read().map((k) => (k.id === id ? { ...k, ...patch, id: k.id, imageModel: normalizeGeminiModel(patch.imageModel) || normalizeGeminiModel(k.imageModel) || GEMINI_FORCED_IMAGE_MODEL } : k)));
}

export function removeGeminiImageKey(id: string) {
  write(read().filter((k) => k.id !== id));
}

/** Re-enable a disabled or cooling key manually. */
export function reactivateGeminiImageKey(id: string) {
  updateGeminiImageKey(id, { status: "active", cooldownUntil: null, disabledReason: null });
}

/** Pick the first available (active, not cooling) key. Reconciles first so
 *  expired cooldowns are eligible again. Returns null when none available. */
export function pickAvailableKey(): GeminiImageKey | null {
  const list = reconcile(read());
  return list.find((k) => k.status === "active" && k.key.trim()) ?? null;
}

export function markKeyUsed(id: string) {
  updateGeminiImageKey(id, { lastUsed: Date.now(), failCount: 0 });
}

/** Cool a key down after a limit error. Escalates: 10m → 30m → 2h, and a daily
 *  quota error parks the key until tomorrow. */
export function markKeyCooldown(id: string, kind: "limit" | "daily") {
  const list = read();
  const k = list.find((x) => x.id === id);
  if (!k) return;
  const failCount = (k.failCount ?? 0) + 1;
  let ms: number;
  if (kind === "daily") {
    ms = msUntilTomorrow();
  } else if (failCount <= 1) {
    ms = COOLDOWN_MS.first;
  } else if (failCount === 2) {
    ms = COOLDOWN_MS.second;
  } else {
    ms = COOLDOWN_MS.third;
  }
  updateGeminiImageKey(id, {
    status: "cooling",
    failCount,
    cooldownUntil: Date.now() + ms,
  });
}

/** Disable a key that will never work as-is (invalid key / model not found). */
export function markKeyDisabled(id: string, reason: string) {
  updateGeminiImageKey(id, { status: "disabled", disabledReason: reason, cooldownUntil: null });
}

export function allCoolingOrDisabled(): boolean {
  const list = reconcile(read());
  if (list.length === 0) return false;
  return list.every((k) => k.status !== "active" || !k.key.trim());
}

/** Earliest time a cooling key becomes available again, or null. */
export function nextRetryTime(): number | null {
  const cooling = reconcile(read())
    .filter((k) => k.status === "cooling" && k.cooldownUntil != null)
    .map((k) => k.cooldownUntil as number);
  return cooling.length ? Math.min(...cooling) : null;
}

// ---- Error classification (shared with the rotation runner) ----

export function isLimitError(msg: string, code: string | null, status: number | null): boolean {
  if (code === "RATE_LIMIT" || status === 429) return true;
  return /resource_exhausted|quota|rate.?limit|too many requests|tier limit exceeded|provider limit/i.test(msg);
}

export function isDailyLimit(msg: string): boolean {
  return /per day|perday|daily limit|quota.*day|per-day|GenerateRequestsPerDay/i.test(msg);
}

export function isInvalidKeyOrModel(msg: string, code: string | null, status: number | null): boolean {
  if (code === "AUTH_ERROR") return true;
  if (status === 400 || status === 401 || status === 403 || status === 404) return true;
  return /api key not valid|invalid api key|api_key_invalid|permission denied|model not found|not found|is not found|unsupported/i.test(msg);
}

/** Message shown when a Gemini key's image free tier is unavailable (quota
 *  limit is literally 0 — the account/project has no free image allowance). */
export const GEMINI_FREE_TIER_UNAVAILABLE_MESSAGE =
  "Gemini image free tier is not available for this account/project. Add billing or switch image provider.";

/** True when the quota error reports a hard zero limit (limit: 0 /
 *  quotaValue: 0). This means retrying will NEVER succeed on this key, so the
 *  key must be disabled instead of cooled down and retried. */
export function isZeroQuotaError(msg: string): boolean {
  if (!msg) return false;
  if (!/quota|resource_exhausted|free.?tier|freetier|billing/i.test(msg)) return false;
  return (
    /"?(?:quota_?value|limit)"?\s*[:=]\s*"?0"?\b/i.test(msg) ||
    /\blimit:\s*0\b/i.test(msg) ||
    /free tier is not (?:enabled|available)/i.test(msg)
  );
}
