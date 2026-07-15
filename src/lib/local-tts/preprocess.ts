// Text preprocessing for the local Kokoro voice engine. Kokoro's own tokenizer
// caps effective input around ~500 characters; anything longer is silently
// truncated, so we split into sentence-safe chunks. This runs entirely in
// the browser — no network calls.

/** Apply the user's pronunciation dictionary. Case-insensitive whole-word. */
export function applyDictionary(
  text: string,
  dict: { from: string; to: string }[],
): string {
  let out = text;
  for (const { from, to } of dict) {
    if (!from) continue;
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${esc}\\b`, "gi"), to);
  }
  return out;
}

/** Normalize whitespace, smart punctuation, and expand a few abbreviations. */
export function normalizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2013|\u2014/g, " - ")
    .replace(/\bDr\.(?=\s+[A-Z])/g, "Doctor")
    .replace(/\bMr\./g, "Mister")
    .replace(/\bMrs\./g, "Mrs")
    .replace(/\bMs\./g, "Ms")
    .replace(/\bSt\.(?=\s+[A-Z])/g, "Saint")
    .replace(/\bvs\./gi, "versus")
    .replace(/\betc\./gi, "etcetera")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into sentence-safe chunks that stay under `maxChars`. */
export function chunkText(text: string, maxChars = 380): string[] {
  const clean = text.trim();
  if (!clean) return [];
  // Split at sentence boundaries but keep the punctuation.
  const sentences = clean.match(/[^.!?\n]+[.!?]+["')\]]*|\S[^.!?\n]*$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = "";
  };
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > maxChars) {
      flush();
      // Long sentence — split at commas/semicolons, then fall back to words.
      const parts = s.split(/([,;])/);
      let acc = "";
      for (const p of parts) {
        if ((acc + p).length > maxChars) {
          if (acc.trim()) chunks.push(acc.trim());
          acc = p;
        } else acc += p;
      }
      if (acc.trim()) {
        if (acc.length > maxChars) {
          const words = acc.split(/\s+/);
          let w = "";
          for (const word of words) {
            if ((w + " " + word).length > maxChars) {
              if (w) chunks.push(w);
              w = word;
            } else w = w ? `${w} ${word}` : word;
          }
          if (w) chunks.push(w);
        } else chunks.push(acc.trim());
      }
      continue;
    }
    if ((current + " " + s).length > maxChars) flush();
    current = current ? `${current} ${s}` : s;
  }
  flush();
  return chunks;
}

export function preprocess(
  text: string,
  dict: { from: string; to: string }[] = [],
): string[] {
  return chunkText(applyDictionary(normalizeText(text), dict));
}