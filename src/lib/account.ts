// Local-only account + credits system. No backend yet — everything is stored
// in localStorage so the app stays private but is structured to become a real
// SaaS later (swap these functions for Supabase calls without touching UI).
import { readLocal, writeLocal, useLocal } from "./local";

/* ---------------- Auth (mock, local) ---------------- */

export interface Account {
  email: string;
  name: string;
  plan: "free" | "basic" | "pro" | "creator";
}

const ACCOUNT_KEY = "stickmax.account";

export function useAccount(): Account | null {
  return useLocal<Account | null>(ACCOUNT_KEY, null);
}

export function getAccount(): Account | null {
  return readLocal<Account | null>(ACCOUNT_KEY, null);
}

export function login(email: string, name?: string) {
  const clean = email.trim().toLowerCase();
  const derived =
    name?.trim() || clean.split("@")[0].replace(/[._-]+/g, " ") || "Creator";
  writeLocal<Account>(ACCOUNT_KEY, {
    email: clean,
    name: derived.replace(/\b\w/g, (c) => c.toUpperCase()),
    plan: "free",
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
}

const CREDITS_KEY = "stickmax.credits";
const DEFAULT_CREDITS = 250;

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

export const LOW_CREDIT_THRESHOLD = 40;

function readState(): CreditState {
  return readLocal<CreditState>(CREDITS_KEY, {
    balance: DEFAULT_CREDITS,
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

export function spendCredits(amount: number, label: string) {
  const s = readState();
  const entry: CreditEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    amount: -Math.abs(amount),
    label,
  };
  writeLocal<CreditState>(CREDITS_KEY, {
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
    balance: s.balance + Math.abs(amount),
    history: [entry, ...s.history].slice(0, 100),
  });
}
