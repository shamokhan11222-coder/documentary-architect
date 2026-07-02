import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { researchTopic, refineCard } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  useResearch,
  saveResearch,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ProjectHeader } from "@/components/ProjectHeader";
import { EditableCard } from "@/components/EditableCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { Research } from "@/lib/types";

export const Route = createFileRoute("/research")({
  head: () => ({ meta: [{ title: "Research — Stickmax Studio" }] }),
  component: ResearchPage,
});

type CardDef = { key: keyof Research; title: string; list: boolean };

const CARDS: CardDef[] = [
  { key: "mainConflict", title: "Main Conflict", list: false },
  { key: "timeline", title: "Timeline", list: true },
  { key: "interestingFacts", title: "Interesting Facts", list: true },
  { key: "scientificFacts", title: "Scientific Facts", list: true },
  { key: "historicalFacts", title: "Historical Facts", list: true },
  { key: "unexpectedTwists", title: "Unexpected Twists", list: true },
  { key: "commonMyths", title: "Common Myths", list: true },
  { key: "bestAngle", title: "Best Story Angle", list: false },
  { key: "endingIdea", title: "Ending Idea", list: false },
  { key: "sources", title: "Verified Sources", list: true },
];

function ResearchPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const research = useResearch(selectedId);
  const run = useServerFn(researchTopic);
  const refine = useServerFn(refineCard);
  const [loading, setLoading] = useState(false);

  async function handleResearch() {
    if (!selected) return;
    setLoading(true);
    try {
      const data = (await run({
        data: { topic: selected.topic, explanation: selected.explanation },
      })) as Omit<Research, "topicId" | "generatedAt">;
      saveResearch({ ...data, topicId: selected.id, generatedAt: Date.now() });
      toast.success("Research complete — reviewed by Research Expert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: keyof Research, list: boolean, text: string) {
    if (!research) return;
    const value = list
      ? text.split("\n").map((l) => l.trim()).filter(Boolean)
      : text;
    saveResearch({ ...research, [key]: value } as Research);
  }

  async function refineField(
    def: CardDef,
    mode: "improve" | "rewrite" | "expand",
  ) {
    if (!research || !selected) return;
    const raw = research[def.key];
    const content = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
    const { content: out } = (await refine({
      data: { topic: selected.topic, cardTitle: def.title, content, mode },
    })) as { content: string };
    updateField(def.key, def.list, out);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <ProjectHeader topics={topics} selectedId={selectedId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Research Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Research Expert dossier, organized into editable cards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {research?.review && (
            <span className="flex items-center gap-1 text-xs">
              <StatusBadge status="Needs Review" />
              {research.review.score}/10
            </span>
          )}
          <Button onClick={handleResearch} disabled={!selected || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {research ? "Re-run research" : "Run research"}
          </Button>
        </div>
      </div>

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">
          Select a project above, or open one from the Projects page.
        </p>
      )}

      {research?.review?.verdict && (
        <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <strong>Quality Reviewer:</strong> {research.review.verdict}
        </p>
      )}

      {research && selected && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {CARDS.map((def) => {
            const raw = research[def.key];
            const value = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
            return (
              <EditableCard
                key={String(def.key)}
                title={def.title}
                value={value}
                onSave={(t) => updateField(def.key, def.list, t)}
                onRefine={(mode) => refineField(def, mode)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
