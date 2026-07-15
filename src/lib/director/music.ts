import type { MusicMood } from "./types";

export const MUSIC_MOODS: MusicMood[] = ["epic", "dark", "nature", "mystery", "hope", "sad"];

export function suggestMood(text: string): MusicMood {
  const t = text.toLowerCase();
  if (/\b(war|battle|hero|victory|rise|conquer|empire)\b/.test(t)) return "epic";
  if (/\b(death|blood|shadow|evil|fear|kill|horror)\b/.test(t)) return "dark";
  if (/\b(forest|river|animal|nature|wild|ocean|jungle)\b/.test(t)) return "nature";
  if (/\b(secret|hidden|mystery|unknown|ancient|lost)\b/.test(t)) return "mystery";
  if (/\b(love|hope|dream|future|dawn|light|freedom)\b/.test(t)) return "hope";
  if (/\b(sad|loss|grief|tear|alone|goodbye)\b/.test(t)) return "sad";
  return "epic";
}

/** Ducking curve: narration segments reduce music level to -18dB. */
export function duckingCurve(
  narrationSegments: Array<{ start: number; end: number }>,
  totalDuration: number,
): Array<{ t: number; gain: number }> {
  const points: Array<{ t: number; gain: number }> = [{ t: 0, gain: 1 }];
  for (const seg of narrationSegments) {
    points.push({ t: Math.max(0, seg.start - 0.3), gain: 1 });
    points.push({ t: seg.start, gain: 0.15 });
    points.push({ t: seg.end, gain: 0.15 });
    points.push({ t: seg.end + 0.4, gain: 1 });
  }
  points.push({ t: totalDuration, gain: 1 });
  return points;
}