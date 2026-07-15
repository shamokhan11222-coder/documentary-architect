import type { CaptionPresetId } from "./types";

export interface CaptionPreset {
  id: CaptionPresetId;
  label: string;
  fontFamily: string;
  fontWeight: number;
  fontSizeVw: number;
  color: string;
  highlight: string;
  stroke: string;
  strokeWidth: number;
  animation: "pop" | "fade" | "slide" | "typewriter";
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "clean",
    label: "Clean",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    fontSizeVw: 4,
    color: "#ffffff",
    highlight: "#facc15",
    stroke: "#000000",
    strokeWidth: 2,
    animation: "fade",
  },
  {
    id: "bold",
    label: "Bold Impact",
    fontFamily: "'Anton', 'Impact', sans-serif",
    fontWeight: 900,
    fontSizeVw: 6,
    color: "#ffffff",
    highlight: "#22d3ee",
    stroke: "#000000",
    strokeWidth: 4,
    animation: "pop",
  },
  {
    id: "highlight",
    label: "Word Highlight",
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSizeVw: 5,
    color: "#ffffff",
    highlight: "#f472b6",
    stroke: "#0f172a",
    strokeWidth: 3,
    animation: "pop",
  },
  {
    id: "cinema",
    label: "Cinema",
    fontFamily: "'Georgia', serif",
    fontWeight: 500,
    fontSizeVw: 3.5,
    color: "#f5f5f5",
    highlight: "#e5b04b",
    stroke: "#000000",
    strokeWidth: 1,
    animation: "slide",
  },
];

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

/** Splits narration into word-level cues using estimated speech rate. */
export function narrationToWords(
  text: string,
  totalDurationSec: number,
  wpm = 155,
): CaptionWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const perWord = Math.max(0.08, totalDurationSec / words.length || 60 / (wpm || 155));
  let t = 0;
  return words.map((w) => {
    const dur = Math.max(0.12, perWord * (0.6 + Math.min(1.2, w.length / 6)));
    const cue = { word: w, start: t, end: t + dur };
    t += dur;
    return cue;
  }).map((c) => ({
    word: c.word,
    start: (c.start / t) * totalDurationSec,
    end: (c.end / t) * totalDurationSec,
  }));
}