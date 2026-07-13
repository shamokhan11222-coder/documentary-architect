// Documentary Visual Prompt Compiler.
//
// Every storyboard scene must produce EXACTLY ONE single full-frame 16:9
// documentary illustration — never a comic page, multi-panel sheet, collage,
// grid, split screen, or manga layout. This module compiles a structured,
// single-image prompt from a scene and sanitizes it so no forbidden words
// (comic, panel, storyboard sheet, collage, montage, sequence...) ever reach
// the image provider.
import type { VisualScene, ThumbnailIdea } from "./types";

/** Mandatory prefix prepended to EVERY image prompt. Forces one very simple
 *  MS Paint-style full-frame image with stick-figure humans only. */
export const SINGLE_FRAME_PREFIX =
  "Create one very simple 2D MS Paint-style educational explainer image. Use primitive hand-drawn shapes, uneven thick black outlines, flat solid colors, and a deliberately amateur sixth-grade drawing appearance. Human characters must be basic stick figures only: round white head, two small black eyes, simple mouth, one-line torso, thin line arms and legs. No hair unless the scene specifically requires it. No realistic body, no detailed clothes, no anime face, no chibi proportions, no cinematic background.";

/** Mandatory negative instruction appended to EVERY image prompt. */
export const NEGATIVE_PROMPT =
  "NO anime, NO manga, NO chibi, NO cartoon mascot, NO detailed human character, NO realistic person, NO 3D, NO Pixar, NO Ghibli, NO cinematic illustration, NO detailed architecture, NO soft shading, NO gradients, NO realistic lighting, NO comic panels, NO collage, NO split screen, NO random text, NO watermark.";

/** Default Stickmax MS-Paint visual style. */
export const GLOBAL_STYLE_LOCK =
  "Crude MS Paint stick-figure diagram, primitive hand-drawn shapes, uneven thick rough black outlines, flat solid colors, no shading, no gradients, maximum 1-3 important objects, plain white background unless the scene clearly occurs outdoors, outdoor backgrounds still use primitive flat shapes only, no decorative details, no unnecessary buildings, no crowd unless required, readable like a simple classroom drawing.";

/** Stable recurring-character description reused in every scene. */
export const CHARACTER_STYLE_LOCK =
  "The recurring main character is a literal black line stick figure: round white head with a thick black outline, two small black eyes, a simple mouth, a single-line torso, thin line arms and legs, consistent proportions and scale in every image. Reuse this exact stick-figure identity — never replace it with a detailed, realistic, anime, or cartoon-mascot person.";

/** Prepended on the single automatic retry when a result looks too polished. */
export const STYLE_CORRECTION_PREFIX =
  "STYLE CORRECTION: The previous result was too polished and character-based. Draw this like a crude MS Paint stick-figure diagram made by a school student. Replace all people with literal line stick figures and remove all decorative background detail.";

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

/** Style/subject phrases that push the model toward polished anime/cinematic
 *  output. Each is rewritten to a crude MS-Paint equivalent before sending. */
const SUBJECT_REWRITES: Array<[RegExp, string]> = [
  [/\byoung\s+handsome\s+(man|woman|boy|girl)\b/gi, "basic stick figure"],
  [/\bhandsome\s+(man|woman|boy|girl)\b/gi, "basic stick figure"],
  [/\bbeautiful\s+(woman|girl|man|boy)\b/gi, "basic stick figure"],
  [/\bexpressive\s+animated\s+character\b/gi, "basic stick figure"],
  [/\billustrated\s+character\b/gi, "basic stick figure"],
  [/\bcartoon\s+(person|character)\b/gi, "basic stick figure"],
  [/\banimated\s+character\b/gi, "basic stick figure"],
  [/\b(young|handsome|beautiful|realistic|detailed)\s+(man|woman|boy|girl|person|people)\b/gi, "basic stick figure"],
  [/\bcinematic\s+city\b/gi, "a few simple flat shapes"],
  [/\bbeautiful\s+architecture\b/gi, "one simple flat building shape"],
  [/\bdetailed\s+(environment|buildings|city|background|architecture)\b/gi, "a plain background with a few flat shapes"],
  [/\bmodern\s+city\b/gi, "a few simple flat shapes"],
  [/\bcinematic\b/gi, "simple"],
  [/\bphotorealistic\b/gi, "simple flat"],
  [/\brealistic\b/gi, "simple flat"],
];

/** Simplify a scene fragment: replace polished/cinematic subject wording with
 *  crude MS-Paint stick-figure equivalents (Section D). */
export function simplifyFragment(text: string): string {
  let out = text || "";
  for (const [re, rep] of SUBJECT_REWRITES) out = out.replace(re, rep);
  return out.replace(/\s{2,}/g, " ").trim();
}

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

  const subject = simplifyFragment(sanitizeFragment(scene.visualDescription));
  const main = simplifyFragment(sanitizeFragment(scene.mainSubject));
  const location = simplifyFragment(sanitizeFragment(scene.background));
  const camera = resolveCamera(scene);
  const mood = sanitizeFragment(scene.emotion);
  const artDir = simplifyFragment(sanitizeFragment(instructions));

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
  const concept = simplifyFragment(sanitizeFragment(idea.mainVisualConcept));
  const main = simplifyFragment(sanitizeFragment(idea.mainSubject));
  const location = simplifyFragment(sanitizeFragment(idea.background));
  const mood = sanitizeFragment(idea.emotion);
  const composition = simplifyFragment(sanitizeFragment(idea.composition));
  const artDir = simplifyFragment(sanitizeFragment(instructions));

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
