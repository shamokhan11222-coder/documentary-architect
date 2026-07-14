/**
 * Surfaces the EXACT provider/AI error. It never replaces a real provider
 * response with a generic message. The only time a generic line is shown is
 * when there was literally no response from any provider (a network failure
 * before any HTTP status came back).
 */
import { exactErrorMessage, parseProviderError } from "./provider-error";
import { recordErrorDetails } from "./error-details";

const NO_RESPONSE_TEST = /failed to fetch|networkerror|load failed|ECONN|ETIMEDOUT/i;
const NO_RESPONSE_MESSAGE = "Our AI is briefly unavailable — please try again shortly.";

/**
 * Returns the exact, user-facing error text and records full details for the
 * Developer Debug panel. `fallback` is used only when the error carries no
 * message at all.
 */
export function humanizeError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  // Always capture the raw detail first so the debug panel has the truth.
  recordErrorDetails(err);

  const detail = parseProviderError(err);
  if (detail) {
    // Structured provider error — show provider, status and exact message.
    return exactErrorMessage(err, fallback);
  }

  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // Literally no response from any provider — the ONLY case for a generic line.
  if (raw && NO_RESPONSE_TEST.test(raw)) return NO_RESPONSE_MESSAGE;
  if (!raw) return NO_RESPONSE_MESSAGE;

  // Otherwise surface the real error verbatim — never a generic replacement.
  return raw || fallback;
}

export function isCreditsError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /credits?\s*(exhausted|finished)|CREDITS_EXHAUSTED|\b402\b|out of credits/i.test(raw);
}

/**
 * Recoverable provider errors — must never crash to the fatal "This page
 * didn't load" screen. Includes credits, rate limits, and provider
 * permission denials.
 */
export function isRecoverableProviderError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return false;
  if (isCreditsError(err)) return true;
  return /RESOURCE_EXHAUSTED|PERMISSION_DENIED|\b429\b|\b403\b|rate[- ]?limit|denied access/i.test(
    raw,
  );
}

export function recoverableProviderMessage(err: unknown): string {
  if (isCreditsError(err)) {
    return "AI usage credits are currently exhausted. Your saved project data is safe. Add AI usage funds or connect another text provider to generate new content.";
  }
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/\b429\b|RESOURCE_EXHAUSTED|rate[- ]?limit/i.test(raw)) {
    return "The AI provider is rate-limiting requests. Please wait a moment and try again.";
  }
  if (/\b403\b|PERMISSION_DENIED|denied access/i.test(raw)) {
    return "The AI provider denied this request. Open API Settings to check your key or switch providers.";
  }
  return humanizeError(err);
}
