// AI Instructions — persistent art/story direction the AI remembers across the
// whole studio (global) and per project. Feeds silently into every generation.
import { useSyncExternalStore } from "react";

const GLOBAL_KEY = "docos.instructions.global";

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  if (typeof window !== "undefined") window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", l);
  };
}

export interface Instruction {
  id: string;
  text: string;
  at: number;
}

function read(): Instruction[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(GLOBAL_KEY) ?? "[]") as Instruction[];
  } catch {
    return [];
  }
}
function write(list: Instruction[]) {
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export function useInstructions(): Instruction[] {
  const snap = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(GLOBAL_KEY) ?? "[]",
    () => "[]",
  );
  try {
    return JSON.parse(snap) as Instruction[];
  } catch {
    return [];
  }
}

export function addInstruction(text: string) {
  if (!text.trim()) return;
  write([{ id: crypto.randomUUID(), text: text.trim(), at: Date.now() }, ...read()]);
}

export function removeInstruction(id: string) {
  write(read().filter((i) => i.id !== id));
}

/** Flatten all instructions into a single art-direction string for generation. */
export function getInstructionText(): string {
  return read()
    .map((i) => i.text)
    .join(" ");
}