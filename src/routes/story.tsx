import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { generateStory, rewriteHook, improveStory } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useResearch,
  useStory,
  saveStory,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score } from "@/components/Score";
import { Steps } from "@/components/Steps";
import type { Story } from "@/lib/types";

export const Route = createFileRoute("/story")({
  head: () => ({ meta: [{ title: "Story — Documentary Studio" }] }),
  component: StoryPage,
});

function StoryPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const research = useResearch(selectedId);
  const story = useStory(selectedId);

  const gen = useServerFn(generateStory);
  const rewrite = useServerFn(rewriteHook);
  const improve = useServerFn(improveStory);
  const [busy, setBusy] = useState<string | null>(null);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function handleGenerate() {
    if (!selected) return;
    return withBusy("gen", async () => {
      const data = (await gen({
        data: { topic: selected.topic, research: research ?? undefined },
      })) as Omit<Story, "topicId" | "generatedAt">;
      saveStory({ ...data, topicId: selected.id, generatedAt: Date.now() });
      toast.success("Script generated");
    });
  }

  function handleRewriteHook() {
    if (!selected || !story) return;
    return withBusy("hook", async () => {
      const { script } = await rewrite({
        data: { topic: selected.topic, script: story.script },
      });
      saveStory({ ...story, script, generatedAt: Date.now() });
      toast.success("Hook rewritten");
    });
  }

  function handleImprove() {
    if (!selected || !story) return;
    return withBusy("improve", async () => {
      const { script } = await improve({
        data: { topic: selected.topic, script: story.script },
      });
      saveStory({ ...story, script, generatedAt: Date.now() });
      toast.success("Story improved");
    });
  }

  function handleCopy() {
    if (!story) return;
    navigator.clipboard.writeText(story.script);
    toast.success("Script copied");
  }

  function handleDownload() {
    if (!story || !selected) return;
    const blob = new Blob([story.script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Steps current="story" />
      <h1 className="text-xl font-semibold">Story Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn research into a documentary script.
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
        <Button onClick={handleGenerate} disabled={!selected || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {story ? "Regenerate" : "Generate script"}
        </Button>
      </div>

      {selected && !research && (
        <p className="mt-3 text-xs text-amber-600">
          No research found for this topic yet — the script will be less grounded. Run
          the Research Engine first for best results.
        </p>
      )}

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">
          Select a topic to generate a script.
        </p>
      )}

      {story && selected && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Score label="Hook" value={story.hookScore} />
            <Score label="Story" value={story.storyScore} />
            <Score label="Engagement" value={story.engagementScore} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              Copy Script
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRewriteHook}
              disabled={!!busy}
            >
              {busy === "hook" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rewrite Hook
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleImprove}
              disabled={!!busy}
            >
              {busy === "improve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Improve Story
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGenerate}
              disabled={!!busy}
            >
              Regenerate
            </Button>
            <Button size="sm" onClick={handleDownload}>
              Download Script
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {story.script}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}