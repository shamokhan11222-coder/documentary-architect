// Permanent Visual Instructions — the studio's default art direction.
// These rules are always applied to every image/scene generation. The editor
// can tweak them, but the defaults are baked in so visuals stay consistent.
import { useSyncExternalStore } from "react";

const KEY = "docos.visual-instructions";

export const DEFAULT_VISUAL_INSTRUCTIONS = `Simple MS Paint documentary style.
Flat colors.
Thick rough black outlines.
Simple stickman character.
Round white face.
No face shine.
No gradients.
No shadows.
No 3D.
No realism.
No cinematic lighting.
Minimal backgrounds.
One clear idea per image.
Visual must match voiceover exactly.
No random objects.
No random characters.
No clutter.
No text unless thumbnail needs text.

Use the reference stickman in every character scene.
Character should appear only when needed.
If the scene is about an object, show the object.
If the scene is about nature, show nature.
If the scene is conceptual, use a simple visual metaphor.

Make visuals feel like simple educational YouTube storytelling.`;

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}

function read(): string {
  if (typeof window === "undefined") return DEFAULT_VISUAL_INSTRUCTIONS;
  const v = localStorage.getItem(KEY);
  return v === null ? DEFAULT_VISUAL_INSTRUCTIONS : v;
}

export function useVisualInstructions(): string {
  return useSyncExternalStore(
    subscribe,
    () => {
      const v = localStorage.getItem(KEY);
      return v === null ? DEFAULT_VISUAL_INSTRUCTIONS : v;
    },
    () => DEFAULT_VISUAL_INSTRUCTIONS,
  );
}

export function setVisualInstructions(text: string) {
  localStorage.setItem(KEY, text);
  listeners.forEach((l) => l());
}

export function resetVisualInstructions() {
  localStorage.setItem(KEY, DEFAULT_VISUAL_INSTRUCTIONS);
  listeners.forEach((l) => l());
}

/** Prompt-ready block injected into every visual generation. */
export function getVisualInstructions(): string {
  return read();
}
