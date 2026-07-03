// Local-only account + credits system. No backend yet — everything is stored
// in localStorage so the app stays private but is structured to become a real
// SaaS later (swap these functions for Supabase calls without touching UI).
import { readLocal, writeLocal, useLocal } from "./local";
import { getActiveProvider, useActiveProvider } from "./provider";

/* ---------------- Auth (mock, local) ---------------- */

export interface Account {
  email: string;
  name: string;
  plan: "free" | "starter" | "pro" | "creator";
  role: "user" | "admin";
}

const ACCOUNT_KEY = "stickmax.account";

/** Owner/admin accounts — not limited by public user credits. */
const OWNER_EMAILS = ["owner@stickmax.io", "admin@stickmax.io"];

export function useAccount(): Account | null {
  return useLocal<Account | null>(ACCOUNT_KEY, null);
}

export function getAccount(): Account | null {
  return readLocal<Account | null>(ACCOUNT_KEY, null);
}

/** True when the signed-in account is the owner/admin (unlimited credits). */
export function isAdmin(): boolean {
  return getAccount()?.role === "admin";
}

export function useIsAdmin(): boolean {
  return useAccount()?.role === "admin";
}

/**
 * True when generation should be unlimited (never gated by internal credits):
 * either an admin/developer account, or a verified external AI provider
 * (e.g. the user's own Gemini/OpenAI key) is connected. Internal credits only
 * apply to normal customers using the built-in AI.
 */
export function hasUnlimitedAccess(): boolean {
  return isAdmin() || getActiveProvider() !== null;
}

/** Reactive version of {@link hasUnlimitedAccess} for UI. */
export function useHasUnlimitedAccess(): boolean {
  return useIsAdmin() || useActiveProvider() !== null;
}

export function login(email: string, name?: string) {
  const clean = email.trim().toLowerCase();
  const derived =
    name?.trim() || clean.split("@")[0].replace(/[._-]+/g, " ") || "Creator";
  const admin = OWNER_EMAILS.includes(clean);
  writeLocal<Account>(ACCOUNT_KEY, {
    email: clean,
    name: derived.replace(/\b\w/g, (c) => c.toUpperCase()),
    plan: admin ? "creator" : "free",
    role: admin ? "admin" : "user",
  });
}

export function logout() {
  writeLocal<Account | null>(ACCOUNT_KEY, null);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/* ---------------- Credits ---------------- */

export interface CreditEntry {
  id: string;
  at: number;
  amount: number; // negative = spent, positive = added
  label: string;
}

interface CreditState {
  balance: number;
  history: CreditEntry[];
  /** Timestamp of the next free-credit renewal (monthly for free plan). */
  renewsAt?: number;
}

const CREDITS_KEY = "stickmax.credits";
export const DEFAULT_CREDITS = 10;

/** Rough per-action credit estimates (used for warnings/estimates). */
export const CREDIT_COSTS = {
  research: 3,
  story: 6,
  image: 2,
  thumbnail: 3,
  seo: 2,
  rating: 1,
  voice: 4,
} as const;

/** Estimated cost of a full auto-generation run (~10 scene images). */
export const FULL_RUN_ESTIMATE =
  CREDIT_COSTS.research +
  CREDIT_COSTS.story +
  CREDIT_COSTS.image * 10 +
  CREDIT_COSTS.thumbnail +
  CREDIT_COSTS.seo +
  CREDIT_COSTS.rating;

export const LOW_CREDIT_THRESHOLD = 5;

/** Free plan renews the welcome allowance once a month. */
export const RENEWAL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const MONTHLY_FREE_CREDITS = DEFAULT_CREDITS;

function readState(): CreditState {
  return readLocal<CreditState>(CREDITS_KEY, {
    balance: DEFAULT_CREDITS,
    renewsAt: Date.now() + RENEWAL_INTERVAL_MS,
    history: [
      {
        id: "seed",
        at: Date.now(),
        amount: DEFAULT_CREDITS,
        label: "Welcome credits",
      },
    ],
  });
}

export function useCredits(): CreditState {
  return useLocal<CreditState>(CREDITS_KEY, readState());
}

export function getBalance(): number {
  return readState().balance;
}

/** Next renewal timestamp (creates a default if the state predates renewals). */
export function getRenewsAt(): number {
  const s = readState();
  return s.renewsAt ?? Date.now() + RENEWAL_INTERVAL_MS;
}

export function useRenewsAt(): number {
  const s = useCredits();
  return s.renewsAt ?? Date.now() + RENEWAL_INTERVAL_MS;
}

/**
 * Top up the monthly free allowance when a renewal is due. Idempotent and safe
 * to call on every app mount. Only free (non-admin) accounts renew.
 */
export function ensureRenewal() {
  if (isAdmin()) return;
  const s = readState();
  const now = Date.now();
  // Backfill a renewal date for older local states.
  if (!s.renewsAt) {
    writeLocal<CreditState>(CREDITS_KEY, { ...s, renewsAt: now + RENEWAL_INTERVAL_MS });
    return;
  }
  if (now < s.renewsAt) return;
  // Advance the renewal window past "now" (covers long absences) and grant once.
  let next = s.renewsAt;
  while (next <= now) next += RENEWAL_INTERVAL_MS;
  const entry: CreditEntry = {
    id: crypto.randomUUID(),
    at: now,
    amount: MONTHLY_FREE_CREDITS,
    label: "Monthly free credits",
  };
  writeLocal<CreditState>(CREDITS_KEY, {
    balance: s.balance + MONTHLY_FREE_CREDITS,
    renewsAt: next,
    history: [entry, ...s.history].slice(0, 100),
  });
}

export interface UsageDay {
  label: string;
  date: string;
  spent: number;
  added: number;
}

/** Aggregate the credit history into per-day spend/top-up buckets for charts. */
export function usageByDay(history: CreditEntry[], days = 7): UsageDay[] {
  const out: UsageDay[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const start = today.getTime() - i * dayMs;
    const end = start + dayMs;
    const inDay = history.filter((h) => h.at >= start && h.at < end);
    out.push({
      label: new Date(start).toLocaleDateString(undefined, { weekday: "short" }),
      date: new Date(start).toLocaleDateString(),
      spent: inDay.filter((h) => h.amount < 0).reduce((s, h) => s + Math.abs(h.amount), 0),
      added: inDay.filter((h) => h.amount > 0).reduce((s, h) => s + h.amount, 0),
    });
  }
  return out;
}

export function spendCredits(amount: number, label: string) {
  // Admins and users with a connected external provider don't consume credits.
  if (hasUnlimitedAccess()) return;
  const s = readState();
  const entry: CreditEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    amount: -Math.abs(amount),
    label,
  };
  writeLocal<CreditState>(CREDITS_KEY, {
    ...s,
    balance: Math.max(0, s.balance - Math.abs(amount)),
    history: [entry, ...s.history].slice(0, 100),
  });
}

export function addCredits(amount: number, label = "Credits added") {
  const s = readState();
  const entry: CreditEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    amount: Math.abs(amount),
    label,
  };
  writeLocal<CreditState>(CREDITS_KEY, {
    ...s,
    balance: s.balance + Math.abs(amount),
    history: [entry, ...s.history].slice(0, 100),
  });
}
