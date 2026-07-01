import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { researchTopic } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useResearch,
  saveResearch,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Steps } from "@/components/Steps";
import type { Research } from "@/lib/types";

export const Route = createFileRoute("/research")({
  head: () => ({ meta: [{ title: "Research — Documentary Studio" }] }),
  component: ResearchPage,
});

function ResearchPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const research = useResearch(selectedId);
  const run = useServerFn(researchTopic);
  const [loading, setLoading] = useState(false);

  async function handleResearch() {
    if (!selected) return;
    setLoading(true);
    try {
      const data = (await run({
        data: { topic: selected.topic, explanation: selected.explanation },
      })) as Omit<Research, "topicId" | "generatedAt">;
      saveResearch({ ...data, topicId: selected.id, generatedAt: Date.now() });
      toast.success("Research complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Steps current="research" />
      <h1 className="text-xl font-semibold">Research Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Deep documentary research for the selected topic.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedTopicId(e.target.value || null)}
        >
          <option value="">Select a saved topic…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.topic}
            </option>
          ))}
        </select>
        <Button onClick={handleResearch} disabled={!selected || loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {research ? "Re-run research" : "Run research"}
        </Button>
      </div>

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">
          Pick a topic here or click “Research this” from the Topics page.
        </p>
      )}

      {research && selected && (
        <div className="mt-6 space-y-5">
          <Section title="Main Conflict">
            <p className="text-sm">{research.mainConflict}</p>
          </Section>
          <ListSection title="Timeline" items={research.timeline} />
          <ListSection title="Historical Facts" items={research.historicalFacts} />
          <ListSection title="Scientific Facts" items={research.scientificFacts} />
          <ListSection title="Interesting Facts" items={research.interestingFacts} />
          <ListSection title="Common Myths" items={research.commonMyths} />
          <ListSection title="Story Angles" items={research.storyAngles} />
          <ListSection title="Unexpected Twists" items={research.unexpectedTwists} />
          <ListSection title="Important People" items={research.importantPeople} />
          <ListSection title="Important Dates" items={research.importantDates} />
          <ListSection title="Sources" items={research.sources} />
          <ListSection title="Key Takeaways" items={research.keyTakeaways} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ListSection({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </Section>
  );
}