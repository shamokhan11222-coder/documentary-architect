// Narration text sanitizer. Runs before Story text is persisted or sent to
// the local Kokoro TTS engine. Fixes the "n§(", "tuěn", replacement-char
// and zero-width symptoms observed on the Story page.
//
// Pure function, no side effects, no network.

export interface SanitizeReport {
  input: string;
  output: string;
  changed: boolean;
  repairs: string[];
  suspicious: string[];
  needsReview: boolean;
}

const ZERO_WIDTH = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
// Control chars except \n and \t
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const REPLACEMENT = /\uFFFD/g;
// Any non-ASCII letter (English narration should not contain these)
const NON_ASCII_LETTER = /[^\x00-\x7F\u00A0-\u00FF]/;

/** Normalize + repair a narration string. Safe for English scripts. */
export function sanitizeNarrationText(raw: string): SanitizeReport {
  const repairs: string[] = [];
  const suspicious: string[] = [];
  if (typeof raw !== "string") {
    return { input: "", output: "", changed: false, repairs, suspicious, needsReview: false };
  }

  let s = raw.normalize("NFKC");

  if (ZERO_WIDTH.test(s)) { s = s.replace(ZERO_WIDTH, ""); repairs.push("zero-width"); }
  if (REPLACEMENT.test(s)) { s = s.replace(REPLACEMENT, ""); repairs.push("replacement-char"); }
  if (CONTROLS.test(s)) { s = s.replace(CONTROLS, ""); repairs.push("control-chars"); }

  const before = s;
  s = s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2013\u2014\u2015]/g, " - ")
    .replace(/\u00A0/g, " ");
  if (s !== before) repairs.push("smart-punct");

  // Repair the specific "n§(" / "§" / "¶" style OCR garbage inside words:
  // strip stray typographic marks that sit between letters.
  const stray = s.replace(/([A-Za-z])[§¶†‡¤¦¨¯¸](?=[A-Za-z(])/g, "$1");
  if (stray !== s) { s = stray; repairs.push("stray-symbols"); }

  // Collapse malformed whitespace
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\s*\n\s*\n\s*/g, "\n\n").trim();

  // Detect leftover suspicious sequences we did NOT auto-fix
  const words = s.split(/\s+/);
  for (const w of words) {
    if (w.length > 40) suspicious.push(w);
    else if (NON_ASCII_LETTER.test(w)) suspicious.push(w);
    else if (/[A-Za-z][^A-Za-z0-9'\-][A-Za-z]/.test(w) && !/^[A-Za-z][.!?,;:]$/.test(w)) {
      // symbols inside a word (e.g. "n§(")
      if (/[§¶¤†‡]/.test(w)) suspicious.push(w);
    }
  }

  return {
    input: raw,
    output: s,
    changed: s !== raw,
    repairs,
    suspicious,
    needsReview: suspicious.length > 0,
  };
}

/** Convenience: just the cleaned string. */
export function sanitizeNarration(raw: string): string {
  return sanitizeNarrationText(raw).output;
}