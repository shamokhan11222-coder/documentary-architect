// Shared, environment-agnostic structured provider error.
// The server embeds full provider details into the thrown Error message using a
// machine marker; the client parses them back out so the Developer Debug panel
// can show the EXACT provider response — never a generic replacement message.

export interface ProviderErrorDetail {
  provider: string;        // gemini | openai | recraft | lovable-gateway | ...
  model: string;
  endpoint: string;
  httpStatus: number | null;
  requestId: string | null;
  responseTimeMs: number | null;
  retryAfter: string | null;
  message: string;         // short exact provider message
  rawBody: string;         // exact raw provider response body
  at: number;
}

const MARKER = "[[PROVIDER_ERROR]]";

export function serializeProviderError(detail: Omit<ProviderErrorDetail, "at">): string {
  const full: ProviderErrorDetail = { ...detail, at: Date.now() };
  // Human-readable prefix + machine payload so even non-parsing paths show real text.
  const head = `${detail.provider} ${detail.httpStatus ?? ""} ${detail.message}`.trim();
  return `${head}\n${MARKER}${JSON.stringify(full)}`;
}

export function makeProviderError(detail: Omit<ProviderErrorDetail, "at">): Error {
  return new Error(serializeProviderError(detail));
}

export function parseProviderError(input: unknown): ProviderErrorDetail | null {
  const raw = input instanceof Error ? input.message : typeof input === "string" ? input : "";
  const idx = raw.indexOf(MARKER);
  if (idx === -1) return null;
  try {
    return JSON.parse(raw.slice(idx + MARKER.length)) as ProviderErrorDetail;
  } catch {
    return null;
  }
}

/** The exact, human-facing message for an error — provider text, never generic. */
export function exactErrorMessage(input: unknown, fallback = ""): string {
  const detail = parseProviderError(input);
  if (detail) {
    return [`${detail.provider}${detail.httpStatus ? ` ${detail.httpStatus}` : ""}:`, detail.message]
      .filter(Boolean)
      .join(" ");
  }
  const raw = input instanceof Error ? input.message : typeof input === "string" ? input : "";
  return raw.trim() || fallback;
}
