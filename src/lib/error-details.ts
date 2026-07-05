// Client store for the LAST provider/AI error, feeding the Developer Debug panel.
// Records the exact provider response so nothing is ever hidden behind a
// generic "AI is briefly unavailable" message.
import { readLocal, writeLocal, useLocal } from "./local";
import { parseProviderError, type ProviderErrorDetail } from "./provider-error";

const KEY = "docos.lastErrorDetails";

export interface ErrorDetails extends Partial<ProviderErrorDetail> {
  message: string;
  at: number;
  hadResponse: boolean; // false only when literally no response from any provider
  code?: string | null;
  httpMethod?: string | null;
  errorType?: string | null;
  responseHeaders?: Record<string, string> | null;
  rawJson?: unknown;
  stack?: string | null;
}

/** Record an error for the debug panel. Extracts structured provider detail
 *  when present; otherwise stores the raw message verbatim. */
export function recordErrorDetails(err: unknown, context?: { provider?: string; model?: string }) {
  const detail = parseProviderError(err);
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  const isNetwork = /failed to fetch|networkerror|load failed|ECONN/i.test(raw);
  const stack = err instanceof Error ? err.stack ?? null : null;
  const value: ErrorDetails = detail
    ? { ...detail, hadResponse: detail.httpStatus != null, stack }
    : {
        provider: context?.provider ?? "unknown",
        model: context?.model ?? "unknown",
        endpoint: "",
        httpStatus: null,
        requestId: null,
        responseTimeMs: null,
        retryAfter: null,
        rawBody: raw,
        message: raw || "Unknown error",
        at: Date.now(),
        hadResponse: !isNetwork,
        stack,
      };
  writeLocal<ErrorDetails>(KEY, value);
}

export function clearErrorDetails() {
  writeLocal<ErrorDetails | null>(KEY, null);
}

/** Record a structured image/thumbnail provider error for the debug panel. */
export function recordImageErrorDetails(debug: {
  provider: string;
  model: string;
  endpoint: string;
  httpStatus: number | null;
  requestId: string | null;
  retryAfter: string | null;
  code: string | null;
  providerMessage: string;
  rawBody: string;
  httpMethod?: string;
  errorType?: string | null;
  responseHeaders?: Record<string, string>;
  rawJson?: unknown;
}) {
  const value: ErrorDetails = {
    provider: debug.provider,
    model: debug.model,
    endpoint: debug.endpoint,
    httpStatus: debug.httpStatus,
    requestId: debug.requestId,
    retryAfter: debug.retryAfter,
    code: debug.code,
    httpMethod: debug.httpMethod ?? "POST",
    errorType: debug.errorType ?? null,
    responseHeaders: debug.responseHeaders ?? null,
    rawJson: debug.rawJson ?? null,
    message: `${debug.provider}${debug.httpStatus ? ` ${debug.httpStatus}` : ""}: ${debug.providerMessage}`,
    rawBody: debug.rawBody,
    at: Date.now(),
    hadResponse: debug.httpStatus != null,
  };
  writeLocal<ErrorDetails>(KEY, value);
}

export function getErrorDetails(): ErrorDetails | null {
  return readLocal<ErrorDetails | null>(KEY, null);
}

export function useErrorDetails(): ErrorDetails | null {
  return useLocal<ErrorDetails | null>(KEY, null);
}
