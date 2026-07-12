// Documentary Visual Prompt Compiler.
//
// Every storyboard scene must produce EXACTLY ONE single full-frame 16:9
// documentary illustration — never a comic page, multi-panel sheet, collage,
// grid, split screen, or manga layout. This module compiles a structured,
// single-image prompt from a scene and sanitizes it so no forbidden words
// (comic, panel, storyboard sheet, collage, montage, sequence...) ever reach
// the image provider.
import type { VisualScene, ThumbnailIdea } from "./types";

/** Mandatory prefix prepended to EVERY image prompt. Forces one full-frame
 *  image and forbids any multi-panel / collage / text layout. */
export const SINGLE_FRAME_PREFIX =
  "Generate exactly one single full-frame image. Do not create a comic page, storyboard sheet, collage, grid, split screen, multi-panel composition, manga layout, frames, borders, captions, speech bubbles, text, logos, or watermarks.";

/** Mandatory negative instruction appended to EVERY image prompt. */
export const NEGATIVE_PROMPT =
  "No comic panels, no multi-panel page, no storyboard sheet, no collage, no split screen, no grid, no borders, no text, no captions, no speech bubbles, no logo, no watermark, no duplicate characters, no random extra people, no deformed hands, no inconsistent clothing, no mixed art styles, no photorealism, no 3D render.";

/** Default Stickmax documentary visual style. */
export const GLOBAL_STYLE_LOCK =
  "Simple hand-drawn digital illustration, MS Paint-inspired, flat solid colors, clean black outlines, minimal shading, simple geometry, uncluttered background, readable silhouettes, expressive body language, slightly imperfect handmade lines, documentary explainer aesthetic, visually clear at YouTube resolution. Not photorealism, not cinematic 3D, not anime, not manga, not a comic-book page, not a coloring book, not watercolor, not oil painting, no glossy render, no clay style, no Pixar style.";

/** Stable recurring-character description reused in every scene. */
export const CHARACTER_STYLE_LOCK =
  "The recurring main character is a simple bald stickman: round white head with a thick black outline, two dot eyes, a simple mouth, a thin black line body, consistent proportions and scale in every image. Reuse this exact character identity — never replace it with a different-looking person.";

/** Words that indicate a multi-scene / multi-panel prompt and must never be sent. */
const FORBIDDEN_WORDS = [
  "comic",
  "panel",
  "panels",
  "storyboard sheet",
  "storyboard",
  "collage",
  "montage",
  "sequence",
  "multiple scenes",
  "multiple moments",
  "several moments",
  "split screen",
  "split-screen",
  "grid of",
  "manga",
  "before and after",
  "speech bubble",
];

/** Camera views allowed for a single scene. */
const CAMERA_VIEWS = [
  "wide shot",
  "medium shot",
  "close-up",
  "over-the-shoulder shot",
  "top-down shot",
  "low angle shot",
];

/** Strip any forbidden multi-panel/comic wording from a free-text fragment so
 *  a bad scene description can never turn the output into a comic page. */
export function sanitizeFragment(text: string): string {
  let out = text || "";
  for (const w of FORBIDDEN_WORDS) {
    out = out.replace(new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Pick one deterministic camera view from the scene's cameraShot text. */
function resolveCamera(scene: VisualScene): string {
  const raw = (scene.cameraShot || "").toLowerCase();
  const match = CAMERA_VIEWS.find((c) => raw.includes(c.split(" ")[0]));
  if (match) return match;
  return CAMERA_VIEWS[Math.abs(scene.sceneNumber) % CAMERA_VIEWS.length];
}

/**
 * Compile ONE structured single-frame documentary prompt from a scene.
 * The compiler enforces: one subject, one action, one location, one camera,
 * one moment, 16:9 landscape, consistent character + style, negative prompt.
 */
export function buildScenePrompt(
  scene: VisualScene,
  instructions: string,
  hasCharacterRef: boolean,
): string {
  const showsCharacter =
    scene.sceneType === "character" ||
    /stickman|character|person|man|woman|figure|narrator|people/i.test(
      `${scene.mainSubject} ${scene.visualDescription}`,
    );

  const subject = sanitizeFragment(scene.visualDescription);
  const main = sanitizeFragment(scene.mainSubject);
  const location = sanitizeFragment(scene.background);
  const camera = resolveCamera(scene);
  const mood = sanitizeFragment(scene.emotion);
  const artDir = sanitizeFragment(instructions);

  const parts = [
    SINGLE_FRAME_PREFIX,
    `SCENE: ${subject || main || "a single clear documentary moment"}.`,
    showsCharacter && main ? `MAIN CHARACTER: ${main}. ${CHARACTER_STYLE_LOCK}` : main ? `MAIN SUBJECT: ${main}.` : "",
    `ACTION: one single clear visible action only.`,
    location ? `LOCATION: ${location}, one clear environment only.` : "",
    `CAMERA: ${camera}, one camera view only.`,
    `COMPOSITION: single full-frame composition, subject clearly placed in frame, no borders.`,
    mood ? `MOOD: ${mood}.` : "",
    `LIGHTING: simple flat lighting relevant to the scene.`,
    `STYLE: ${GLOBAL_STYLE_LOCK}`,
    hasCharacterRef ? "Match the provided reference images exactly for character, style, colors and line work." : "",
    artDir ? `Extra art direction: ${artDir}.` : "",
    `FORMAT: 16:9 landscape, one single full-frame illustration.`,
    NEGATIVE_PROMPT,
  ];

  return validatePrompt(parts.filter(Boolean).join(" "));
}

/** Build a single full-frame thumbnail prompt (16:9). */
export function buildThumbnailPrompt(idea: ThumbnailIdea, instructions: string): string {
  const concept = sanitizeFragment(idea.mainVisualConcept);
  const main = sanitizeFragment(idea.mainSubject);
  const location = sanitizeFragment(idea.background);
  const mood = sanitizeFragment(idea.emotion);
  const composition = sanitizeFragment(idea.composition);
  const artDir = sanitizeFragment(instructions);

  const parts = [
    SINGLE_FRAME_PREFIX,
    `A bold single-frame YouTube documentary thumbnail illustration.`,
    `SCENE: ${concept || main || "a single striking documentary moment"}.`,
    main ? `MAIN SUBJECT: ${main}. ${CHARACTER_STYLE_LOCK}` : "",
    location ? `LOCATION: ${location}, one clear environment only.` : "",
    composition ? `COMPOSITION: ${composition}, single full-frame, no borders.` : "COMPOSITION: single full-frame, no borders.",
    mood ? `MOOD: ${mood}.` : "",
    idea.textOnThumbnail ? `Include one short bold readable headline: "${sanitizeFragment(idea.textOnThumbnail)}".` : "",
    `STYLE: ${GLOBAL_STYLE_LOCK}`,
    artDir ? `Extra art direction: ${artDir}.` : "",
    `FORMAT: 16:9 landscape, one single full-frame illustration.`,
    NEGATIVE_PROMPT,
  ];

  return parts.filter(Boolean).join(" ");
}

/** Final safety pass: guarantee the prefix and negative are present and no
 *  forbidden multi-panel wording leaked into the descriptive portion. */
export function validatePrompt(prompt: string): string {
  let out = prompt;
  if (!out.startsWith(SINGLE_FRAME_PREFIX)) out = `${SINGLE_FRAME_PREFIX} ${out}`;
  if (!out.includes(NEGATIVE_PROMPT)) out = `${out} ${NEGATIVE_PROMPT}`;
  return out;
}
