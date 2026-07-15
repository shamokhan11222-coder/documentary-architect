// Compiles the Reference Studio prompt sent to the reference adapter.
//
// Layout:
//   SUBJECT: <subject profile + subject-ref note>
//   STYLE:   <style-ref note + weight hint>
//   ENVIRONMENT: <env-ref note>
//   SCENE:   <caller-supplied scene action>
//   NEGATIVE: <banned subjects>
import type { ReferenceState, SubjectProfile } from "./references";

const BANNED_SUBJECTS = ["tiger", "lion", "dog", "cat", "human", "person", "stickman", "stick figure", "alien"];

export function subjectLine(subject: SubjectProfile): string {
  if (!subject.name && !subject.species) return "";
  const parts: string[] = [];
  if (subject.name) parts.push(subject.name);
  const detail: string[] = [];
  if (subject.species) detail.push(subject.species);
  if (subject.age) detail.push(subject.age);
  if (detail.length) parts.push(`(${detail.join(", ")})`);
  if (subject.traits.length) parts.push(`traits: ${subject.traits.join(", ")}`);
  return parts.join(" ");
}

export interface CompiledReferencePrompt {
  prompt: string;
  negative: string;
  bannedSubjects: string[];
}

export function compileReferencePrompt(
  state: ReferenceState,
  sceneAction: string,
): CompiledReferencePrompt {
  const subj = subjectLine(state.subject);
  const hasSubjectRef = state.cards.some((c) => c.active && c.category === "subject");
  const hasStyleRef = state.cards.some((c) => c.active && c.category === "style");
  const hasEnvRef = state.cards.some((c) => c.active && c.category === "environment");

  const lines: string[] = [];
  if (subj) {
    lines.push(
      `SUBJECT: The same ${subj}${hasSubjectRef ? " from the provided subject references" : ""}.` +
        " Keep species, age, fur color, face identity and body proportions consistent across every scene.",
    );
  }
  if (hasStyleRef) {
    lines.push(
      "STYLE: Match the drawing language, linework, color palette and visual simplicity of the style references. Label the result Reference-Guided Style, not an exact clone.",
    );
  }
  if (hasEnvRef) {
    lines.push("ENVIRONMENT: Use the provided environment references when relevant to the scene.");
  }
  lines.push(`SCENE ACTION: ${sceneAction.trim()}`);
  lines.push(
    `NEGATIVE: Do not depict any of: ${BANNED_SUBJECTS.join(", ")}. Do not replace the subject with another species.`,
  );
  return {
    prompt: lines.join("\n"),
    negative: BANNED_SUBJECTS.join(", "),
    bannedSubjects: BANNED_SUBJECTS,
  };
}

export function isBannedInPrompt(prompt: string): string | null {
  const p = prompt.toLowerCase();
  for (const w of BANNED_SUBJECTS) if (p.includes(w)) return w;
  return null;
}