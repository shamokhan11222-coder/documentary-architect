// Documentary Visual Prompt Compiler.
//
// Every storyboard scene must produce EXACTLY ONE single full-frame 16:9
// documentary illustration — never a comic page, multi-panel sheet, collage,
// grid, split screen, or manga layout. This module compiles a structured,
// single-image prompt from a scene and sanitizes it so no forbidden words
// (comic, panel, storyboard sheet, collage, montage, sequence...) ever reach
// the image provider.
import type { VisualScene, ThumbnailIdea, ThumbnailConcept } from "./types";

/** Mandatory prefix prepended to EVERY image prompt. Forces one very simple
 *  MS Paint-style full-frame image with stick-figure humans only. */
export const SINGLE_FRAME_PREFIX =
  "Extremely simple MS Paint educational explainer illustration. One single flat 2D drawing on a plain white background, drawn with a thick uneven black pen. Every character is a literal stick figure: a plain round white head with a thick uneven black outline, two small solid black dot eyes, a short simple mouth, a single vertical line for the torso, thin straight line arms and legs. Flat solid primary colors, thick uneven hand-drawn black outlines, primitive shapes only, no shading, no gradients, no rendering, no 3D, no anime, no manga, no Pixar, no Disney, no realistic human, no alien, no mascot, no bean-shaped body.";

/** Mandatory negative instruction appended to EVERY image prompt. */
export const NEGATIVE_PROMPT =
  "Negative prompt: anime, manga, chibi, cartoon mascot, bean body, oval alien head, big round mascot, detailed human, realistic person, muscular body, hair rendering, 3D, Pixar, Disney, Ghibli, cinematic, photorealistic, DSLR, soft shading, gradients, ambient occlusion, realistic lighting, comic panels, split screen, collage, watermark, signature, random letters, gibberish text, extra fingers, deformed hands.";

/** Default Stickmax MS-Paint visual style. */
export const GLOBAL_STYLE_LOCK =
  "Crude MS Paint educational explainer drawing, literal stick-figure line art, flat solid primary colors, thick uneven hand-drawn black pen outlines, no shading, no gradients, no rendering, plain white background, maximum 1-3 important objects, primitive hand-drawn scenery only, no decorative details, no crowds, uncluttered composition.";

/** Stable recurring-character description reused in every scene. */
export const CHARACTER_STYLE_LOCK =
  "The recurring main character is a literal stick figure: a plain round white head with a thick uneven black outline, two small solid black dot eyes, a short simple mouth, a single vertical black line for the torso, thin straight black line arms and legs, no neck, no hair, no clothing detail. Identical proportions and identical face in every image. Never draw a realistic, anime, chibi, Pixar or mascot character — always this exact literal stick figure.";

/** Prepended on the single automatic retry when a result looks too polished. */
export const STYLE_CORRECTION_PREFIX =
  "STYLE CORRECTION — REDRAW. The previous result was polished, anime, mascot or alien-looking and is REJECTED. Redraw in crude MS Paint educational explainer style only: literal stick figures with a plain round white head, small black dot eyes, short mouth, single line torso, line arms and legs. Flat solid primary colors, thick uneven black pen outlines, no shading, no rendering, no anime, no mascot, no bean body.";

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

// ---------------------------------------------------------------------------
// Phase 3 — Thumbnail COMPOSITOR illustration prompt.
//
// The compositor draws ALL text and graphic annotations (arrows/circles/checks)
// programmatically on a canvas. The image provider is therefore asked ONLY for
// a crude MS-Paint illustration: background + one main visual + literal stick
// figures. It must NOT draw any letters, words, headlines, arrows or circles —
// those are added afterwards as controlled layers.
// ---------------------------------------------------------------------------

const BACKGROUND_PROMPT: Record<string, string> = {
  "plain white": "plain solid white background, nothing else in the background",
  "flat solid color": "one flat solid pastel color background, no scenery",
  "simple outdoor": "very simple outdoor background using only a flat ground line and flat sky, primitive flat shapes only",
};

/** Literal stick figure description — repeated verbatim so the provider cannot
 *  drift into alien/mascot/anime/chibi characters. */
export const LITERAL_STICK_FIGURE =
  "Each person is a literal stick figure ONLY: a plain round white head with a thick uneven black outline, two small solid black dot eyes, one short simple mouth, a single vertical black line for the torso, two thin straight black line arms, two thin straight black line legs. No neck, no hair, no ears, no oval alien head, no bean body, no round mascot body, no clothing mass, no detailed hands, no anime face, no chibi proportions, no shading, no rendering.";

export const THUMBNAIL_NEGATIVE =
  "Negative prompt: text, letters, words, numbers, captions, watermark, signature, arrows, circles, checkmarks, alien, mascot, bean-shaped character, round mascot body, oval alien head, Pixar, Disney, anime, manga, chibi, detailed human, realistic person, muscular body, 3D, gradients, soft shading, ambient occlusion, detailed background, busy scene, crowd.";

/** Build the illustration-only prompt for a normalized thumbnail concept. */
export function buildThumbnailIllustrationPrompt(concept: ThumbnailConcept, instructions = ""): string {
  const visual = simplifyFragment(sanitizeFragment(concept.mainVisual || "one large simple object"));
  const bg = BACKGROUND_PROMPT[concept.backgroundType] ?? BACKGROUND_PROMPT["plain white"];
  const artDir = simplifyFragment(sanitizeFragment(instructions));

  let people: string;
  if (concept.characterCount === 0) {
    people = "No people. Show only the single main object, large and centered.";
  } else {
    const n = concept.characterCount === 2 ? "Exactly two" : "Exactly one";
    people = `${n} literal stick figure${concept.characterCount === 2 ? "s" : ""} with a ${concept.emotion} expression, clearly interacting with the main object. ${LITERAL_STICK_FIGURE}`;
  }

  const parts = [
    // Front-load the named style + character — diffusion models weigh the first tokens most.
    "Crude MS Paint educational explainer thumbnail illustration, literal stick figures, primitive shapes, single-panel drawing.",
    people,
    `MAIN VISUAL: ${visual}. Draw it large, simple, clearly the focal point, with thick uneven black pen outlines and flat dull colors.`,
    `BACKGROUND: ${bg}.`,
    "COMPOSITION: one single strong visual idea, single full-frame, generous empty margins at the top and sides so a headline can be added later, no borders, no panels.",
    "STYLE: crude MS Paint explainer look — flat solid primary colors, thick uneven hand-drawn black pen outlines, no shading, no gradients, no rendering, no 3D.",
    artDir ? `Extra art direction: ${artDir}.` : "",
    "FORMAT: 16:9 landscape, one single full-frame single-panel comic illustration.",
    THUMBNAIL_NEGATIVE,
  ];
  return parts.filter(Boolean).join(" ");
}
