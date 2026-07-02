import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, Plus, BookOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  KNOWLEDGE_SECTIONS,
  useKnowledge,
  addKnowledge,
  removeKnowledge,
} from "@/lib/knowledge";
import type { KnowledgeKind } from "@/lib/types";

export const Route = createFileRoute("/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base — Stickmax Studio" }] }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const items = useKnowledge();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function add(kind: KnowledgeKind) {
    const text = (drafts[kind] ?? "").trim();
    if (!text) return;
    addKnowledge(kind, text);
    setDrafts((d) => ({ ...d, [kind]: "" }));
    toast.success("Saved to knowledge base");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        The studio's long-term memory. Save your proven winners here — the experts
        emulate them on every new project.
      </p>

      <div className="mt-6 space-y-4">
        {KNOWLEDGE_SECTIONS.map((section) => {
          const list = items.filter((i) => i.kind === section.kind);
          return (
            <div key={section.kind} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{section.label}</div>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={drafts[section.kind] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [section.kind]: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && add(section.kind)}
                  placeholder={`Add a ${section.label.toLowerCase()} example…`}
                  className="h-9"
                />
                <Button size="sm" onClick={() => add(section.kind)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {list.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {list.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                    >
                      <span className="whitespace-pre-wrap">{item.content}</span>
                      <button
                        onClick={() => removeKnowledge(item.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
