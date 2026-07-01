// Internal visual style constants. The user never sees these — prompts are
// generated silently behind the scenes.
import type { VisualScene, ThumbnailIdea } from "./types";

export const GLOBAL_STYLE_LOCK =
  "Simple MS Paint educational documentary style, flat solid colors, thick slightly rough black outlines, simple childlike shapes, clean minimal composition. No gradients, no shadows, no 3D, no realism, no cinematic lighting, no detailed textures, no watermark, no frame.";

export const CHARACTER_STYLE_LOCK =
  "The character is a simple bald stickman: round white head, thick black outline, two dot eyes, a simple mouth, a thin black line body. No hair, no clothes unless clearly needed, no shading on the face. Keep the exact same head shape, body proportions, eyes, outline weight and scale in every image.";

export const NEGATIVE =
  "realism, 3d render, photograph, gradients, drop shadows, complex textures, extra characters, clutter, watermark, signature, text captions.";

/** Build an image-generation prompt from a scene — silent, internal. */
export function buildScenePrompt(
  scene: VisualScene,
  instructions: string,
  hasCharacterRef: boolean,
): string {
  const showsCharacter =
    scene.sceneType === "character" ||
    /stickman|character|person|man|woman|figure/i.test(
      `${scene.mainSubject} ${scene.visualDescription}`,
    );
  return [
    `A single educational documentary storyboard illustration.`,
    scene.visualDescription,
    scene.mainSubject ? `Main subject: ${scene.mainSubject}.` : "",
    scene.background ? `Background: ${scene.background}.` : "",
    scene.cameraShot ? `${scene.cameraShot}.` : "",
    scene.emotion ? `Mood: ${scene.emotion}.` : "",
    GLOBAL_STYLE_LOCK,
    showsCharacter ? CHARACTER_STYLE_LOCK : "",
    hasCharacterRef
      ? "Match the provided reference images exactly for the character, style, colors and line work."
      : "",
    instructions ? `Extra art direction: ${instructions}` : "",
    `Avoid: ${NEGATIVE}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Build a thumbnail image prompt — silent, internal. */
export function buildThumbnailPrompt(idea: ThumbnailIdea, instructions: string): string {
  return [
    `A bold YouTube documentary thumbnail illustration.`,
    idea.mainVisualConcept,
    idea.mainSubject ? `Main subject: ${idea.mainSubject}.` : "",
    idea.background ? `Background: ${idea.background}.` : "",
    idea.emotion ? `Strong emotion: ${idea.emotion}.` : "",
    idea.composition ? `Composition: ${idea.composition}.` : "",
    idea.textOnThumbnail ? `Include large bold readable text: "${idea.textOnThumbnail}".` : "",
    GLOBAL_STYLE_LOCK,
    CHARACTER_STYLE_LOCK,
    instructions ? `Extra art direction: ${instructions}` : "",
    `Avoid: ${NEGATIVE}`,
  ]
    .filter(Boolean)
    .join(" ");
}