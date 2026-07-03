/**
 * Maps raw error codes / messages into friendly, human-readable copy so users
 * never see machine strings like "CREDITS_EXHAUSTED" or "402".
 */
const MAP: Array<{ test: RegExp; message: string }> = [
  {
    test: /credits?\s*(exhausted|finished)|CREDITS_EXHAUSTED|\b402\b|out of credits/i,
    message: "You're out of credits — upgrade to keep generating.",
  },
  {
    test: /\b429\b|rate.?limit|too many requests/i,
    message: "We're generating a lot right now — please try again in a moment.",
  },
  {
    test: /\b(401|403)\b|unauthor|forbidden/i,
    message: "Please sign in again to continue.",
  },
  {
    test: /network|failed to fetch|timeout|timed out|ECONN/i,
    message: "Connection hiccup — check your network and try again.",
  },
  {
    test: /\b5\d\d\b|internal server|unavailable/i,
    message: "Our AI is briefly unavailable — please try again shortly.",
  },
];

export function humanizeError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  for (const { test, message } of MAP) {
    if (test.test(raw)) return message;
  }
  // Never surface SHOUTY_SNAKE_CASE codes or bare JSON to users.
  if (/^[A-Z0-9_]{4,}$/.test(raw.trim()) || raw.trim().startsWith("{")) return fallback;
  return raw;
}

export function isCreditsError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /credits?\s*(exhausted|finished)|CREDITS_EXHAUSTED|\b402\b|out of credits/i.test(raw);
}
