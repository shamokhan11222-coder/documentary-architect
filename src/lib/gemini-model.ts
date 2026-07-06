export const GEMINI_FORCED_IMAGE_MODEL = "models/gemini-2.5-flash-image";
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