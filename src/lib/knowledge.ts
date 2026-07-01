// Knowledge Base — the studio's long-term "best of" memory. The AI learns from
// approved work: best hooks, stories, visual styles, thumbnails, SEO, voice
// settings, instructions, plus completed / approved / rejected topics.
import { readLocal, writeLocal, useLocal } from "./local";
import type { KnowledgeItem, KnowledgeKind } from "./types";

const KEY = "docos.knowledge";

export const KNOWLEDGE_SECTIONS: { kind: KnowledgeKind; label: string }[] = [
  { kind: "hook", label: "Best Hooks" },
  { kind: "story", label: "Best Stories" },
  { kind: "visualStyle", label: "Best Visual Styles" },
  { kind: "thumbnail", label: "Best Thumbnails" },
  { kind: "seo", label: "Best SEO" },
  { kind: "voice", label: "Best Voice Settings" },
  { kind: "instruction", label: "Best AI Instructions" },
  { kind: "completedProject", label: "Completed Projects" },
  { kind: "approvedTopic", label: "Approved Topics" },
  { kind: "rejectedTopic", label: "Rejected Topics" },
];

export function useKnowledge(): KnowledgeItem[] {
  return useLocal<KnowledgeItem[]>(KEY, []);
}

export function addKnowledge(
  kind: KnowledgeKind,
  content: string,
  opts?: { note?: string; topicId?: string },
) {
  if (!content.trim()) return;
  const list = readLocal<KnowledgeItem[]>(KEY, []);
  if (list.some((k) => k.kind === kind && k.content === content.trim())) return;
  const item: KnowledgeItem = {
    id: crypto.randomUUID(),
    kind,
    content: content.trim().slice(0, 2000),
    note: opts?.note,
    topicId: opts?.topicId,
    at: Date.now(),
  };
  writeLocal(KEY, [item, ...list].slice(0, 800));
}

export function removeKnowledge(id: string) {
  writeLocal(KEY, readLocal<KnowledgeItem[]>(KEY, []).filter((k) => k.id !== id));
}

export function clearKnowledge() {
  writeLocal(KEY, []);
}

/** Prompt-ready knowledge snippet for a given kind (best examples to emulate). */
export function getKnowledgeContext(kinds: KnowledgeKind[]): string {
  const list = readLocal<KnowledgeItem[]>(KEY, []);
  const picked = list.filter((k) => kinds.includes(k.kind));
  if (!picked.length) return "";
  return (
    "KNOWLEDGE BASE (emulate these proven winners):\n" +
    picked.slice(0, 30).map((k) => `- [${k.kind}] ${k.content}`).join("\n")
  );
}
