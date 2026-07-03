// Gathers the studio's saved steering data (AI Instructions + Knowledge Base)
// so it can be injected into every AI generation request. Client-only: reads
// localStorage-backed stores and returns plain strings safe to send to server
// functions. This is what makes Instructions/Knowledge actively shape output
// instead of merely being saved.
import { getInstructionText } from "./instructions";
import { getKnowledgeContext } from "./knowledge";
import { readLocal, writeLocal } from "./local";
import type { KnowledgeKind } from "./types";
import type { ScriptPattern } from "./ai.functions";

export interface InjectionContext {
  instructions: string;
  knowledge: string;
}

/** Build the instructions + knowledge injection for a given stage. */
export function buildInjection(kinds: KnowledgeKind[]): InjectionContext {
  return {
    instructions: getInstructionText(),
    knowledge: getKnowledgeContext(kinds),
  };
}

// ---- Script Analyzer pattern persistence ----
// The analyzed reference pattern is saved so the main Story engine can reuse it.
const PATTERN_KEY = "docos.scriptPattern";

export function saveScriptPattern(pattern: ScriptPattern | null) {
  writeLocal(PATTERN_KEY, pattern);
}

export function getScriptPattern(): ScriptPattern | null {
  return readLocal<ScriptPattern | null>(PATTERN_KEY, null);
}
