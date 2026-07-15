import type { MotionPreset } from "./types";

const PRESETS: MotionPreset[] = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "tilt-up",
  "tilt-down",
  "ken-burns",
  "camera-travel",
  "focus-shift",
];

/**
 * Selects a motion preset for a scene using deterministic keyword heuristics
 * + rotation so consecutive scenes never repeat the same move.
 */
export function pickMotion(
  sceneText: string,
  index: number,
  prev?: MotionPreset,
): MotionPreset {
  const t = sceneText.toLowerCase();
  const rules: Array<[RegExp, MotionPreset]> = [
    [/\b(rise|rising|soar|sky|tower|mountain|up|above)\b/, "tilt-up"],
    [/\b(fall|falling|descend|below|down|underground|deep)\b/, "tilt-down"],
    [/\b(travel|journey|road|walk|run|move|chase)\b/, "camera-travel"],
    [/\b(reveal|discover|slow|calm|memory)\b/, "ken-burns"],
    [/\b(close|face|eye|hand|detail|zoom)\b/, "zoom-in"],
    [/\b(wide|vast|landscape|horizon|city|world)\b/, "zoom-out"],
    [/\b(left|west|past|behind)\b/, "pan-left"],
    [/\b(right|east|future|ahead)\b/, "pan-right"],
    [/\b(focus|realize|understand|truth|secret)\b/, "focus-shift"],
  ];
  for (const [re, preset] of rules) {
    if (re.test(t) && preset !== prev) return preset;
  }
  // Deterministic rotation as fallback
  let pick = PRESETS[index % PRESETS.length];
  if (pick === prev) pick = PRESETS[(index + 1) % PRESETS.length];
  return pick;
}

export function motionCss(preset: MotionPreset, durationMs = 6000): string {
  const d = `${durationMs}ms`;
  switch (preset) {
    case "zoom-in":
      return `@keyframes m{from{transform:scale(1)}to{transform:scale(1.15)}}animation:m ${d} ease-out both;`;
    case "zoom-out":
      return `@keyframes m{from{transform:scale(1.15)}to{transform:scale(1)}}animation:m ${d} ease-out both;`;
    case "pan-left":
      return `@keyframes m{from{transform:scale(1.15) translateX(4%)}to{transform:scale(1.15) translateX(-4%)}}animation:m ${d} linear both;`;
    case "pan-right":
      return `@keyframes m{from{transform:scale(1.15) translateX(-4%)}to{transform:scale(1.15) translateX(4%)}}animation:m ${d} linear both;`;
    case "tilt-up":
      return `@keyframes m{from{transform:scale(1.15) translateY(4%)}to{transform:scale(1.15) translateY(-4%)}}animation:m ${d} linear both;`;
    case "tilt-down":
      return `@keyframes m{from{transform:scale(1.15) translateY(-4%)}to{transform:scale(1.15) translateY(4%)}}animation:m ${d} linear both;`;
    case "ken-burns":
      return `@keyframes m{from{transform:scale(1) translate(-2%,-2%)}to{transform:scale(1.15) translate(2%,2%)}}animation:m ${d} ease-in-out both;`;
    case "camera-travel":
      return `@keyframes m{from{transform:scale(1.2) translateX(-6%)}to{transform:scale(1.05) translateX(6%)}}animation:m ${d} ease-in-out both;`;
    case "focus-shift":
      return `@keyframes m{from{filter:blur(6px);transform:scale(1.05)}to{filter:blur(0);transform:scale(1)}}animation:m ${d} ease-out both;`;
  }
}