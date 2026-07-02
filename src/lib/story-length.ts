// Shared documentary length presets. Word ranges are tuned to a ~150 wpm
// narration pace, so estimated voice duration lines up with the target range.
export interface LengthPreset {
  id: string;
  label: string;
  minMinutes: number;
  maxMinutes: number;
  minWords: number;
  maxWords: number;
}

export const LENGTH_PRESETS: LengthPreset[] = [
  { id: "3-5", label: "3–5 minutes", minMinutes: 3, maxMinutes: 5, minWords: 450, maxWords: 750 },
  { id: "6-8", label: "6–8 minutes", minMinutes: 6, maxMinutes: 8, minWords: 900, maxWords: 1200 },
  { id: "9-11", label: "9–11 minutes", minMinutes: 9, maxMinutes: 11, minWords: 1300, maxWords: 1700 },
  { id: "12-15", label: "12–15 minutes", minMinutes: 12, maxMinutes: 15, minWords: 1800, maxWords: 2300 },
];

export const DEFAULT_LENGTH_ID = "9-11";

export function getPreset(id: string): LengthPreset | undefined {
  return LENGTH_PRESETS.find((p) => p.id === id);
}

/** Words per minute used to derive a custom range from a minute count. */
export const WORDS_PER_MINUTE = 150;

export function customPreset(minutes: number): LengthPreset {
  const m = Math.max(1, Math.round(minutes));
  return {
    id: "custom",
    label: `${m} minutes (custom)`,
    minMinutes: m,
    maxMinutes: m,
    minWords: Math.round(m * WORDS_PER_MINUTE * 0.85),
    maxWords: Math.round(m * WORDS_PER_MINUTE * 1.15),
  };
}
