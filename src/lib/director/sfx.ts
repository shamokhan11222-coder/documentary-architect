export const SFX_LIBRARY = [
  "wind",
  "water",
  "birds",
  "roar",
  "explosion",
  "footsteps",
  "rain",
  "thunder",
  "fire",
  "crowd",
  "whoosh",
  "heartbeat",
] as const;

export type SfxId = (typeof SFX_LIBRARY)[number];

const SFX_RULES: Array<[RegExp, SfxId]> = [
  [/\b(wind|breeze|storm|gale)\b/i, "wind"],
  [/\b(water|river|ocean|sea|wave|stream)\b/i, "water"],
  [/\b(bird|forest|jungle|dawn|morning)\b/i, "birds"],
  [/\b(roar|beast|lion|monster|dragon)\b/i, "roar"],
  [/\b(explode|explosion|blast|bomb)\b/i, "explosion"],
  [/\b(walk|run|step|march|footstep)\b/i, "footsteps"],
  [/\b(rain|drizzle|pour)\b/i, "rain"],
  [/\b(thunder|lightning|strike)\b/i, "thunder"],
  [/\b(fire|flame|burn|smoke)\b/i, "fire"],
  [/\b(crowd|city|market|street|people)\b/i, "crowd"],
  [/\b(sudden|reveal|flash|shift)\b/i, "whoosh"],
  [/\b(fear|tense|pulse|silence|dread)\b/i, "heartbeat"],
];

export function detectSfx(sceneText: string): SfxId[] {
  const hits = new Set<SfxId>();
  for (const [re, id] of SFX_RULES) if (re.test(sceneText)) hits.add(id);
  return Array.from(hits).slice(0, 3);
}