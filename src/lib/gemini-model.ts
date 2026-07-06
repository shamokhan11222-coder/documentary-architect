export const GEMINI_FORCED_IMAGE_MODEL = "models/gemini-3.1-flash-image";
export const GEMINI_IMAGE_MODEL_FALLBACKS = [
  "models/gemini-3.1-flash-image",
  "models/gemini-3.1-flash-lite-image",
  "models/gemini-3-pro-image",
  "models/gemini-2.5-flash-image",
];
export const GEMINI_TEXT_MODEL_DEFAULT_FULL = "models/gemini-2.5-flash";
export const GEMINI_TTS_MODEL_DEFAULT_FULL = "models/gemini-2.5-flash-preview-tts";

export function normalizeGeminiModel(model: unknown): string {
  let value = typeof model === "string" ? model.trim() : "";
  if (!value) return "";

  const parenthesized = value.match(/\(([^)]+)\)/);
  if (parenthesized) value = parenthesized[1].trim();

  if (/^models\/(gemini|imagen|veo)-[a-z0-9._-]+$/i.test(value)) {
    return value;
  }

  if (/^(gemini|imagen|veo)-[a-z0-9._-]+$/i.test(value)) {
    return `models/${value}`;
  }

  return "";
}

export function rankedGeminiImageModels(available: string[], preferred?: string): string[] {
  const normalizedAvailable = available.map(normalizeGeminiModel).filter(Boolean);
  const availableSet = new Set(normalizedAvailable);
  const ranked: string[] = [];
  const add = (model?: string) => {
    const normalized = normalizeGeminiModel(model);
    if (normalized && availableSet.has(normalized) && !ranked.includes(normalized)) ranked.push(normalized);
  };
  add(preferred);
  for (const model of GEMINI_IMAGE_MODEL_FALLBACKS) add(model);
  for (const model of normalizedAvailable) add(model);
  return ranked;
}

export function preferredGeminiImageModel(available: string[], preferred?: string): string {
  return rankedGeminiImageModels(available, preferred)[0] ?? GEMINI_FORCED_IMAGE_MODEL;
}