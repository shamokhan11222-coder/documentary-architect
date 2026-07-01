import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { generateThumbnails, regenerateThumbnail } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useResearch,
  useThumbnails,
  saveThumbnails,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { Steps } from "@/components/Steps";
import { copyText, downloadTxt, downloadJson, slugify } from "@/lib/io";
import type { ThumbnailIdea } from "@/lib/types";

export const Route = createFileRoute("/thumbnail")({
  head: () => ({ meta: [{ title: "Thumbnail — Documentary Studio" }] }),
  component: ThumbnailPage,
});

function ideaToText(idx: number, i: ThumbnailIdea): string {
  return [
    `Thumbnail ${idx + 1}: ${i.thumbnailTitle}`,
    `Concept: ${i.mainVisualConcept}`,
    `Main Subject: ${i.mainSubject}`,
    `Background: ${i.background}`,
    `Emotion: ${i.emotion}`,
    `Text on Thumbnail: ${i.textOnThumbnail}`,
    `Composition: ${i.composition}`,
    `CTR Score: ${i.ctrScore}/10`,
    `Why It Works: ${i.whyItWorks}`,
    `Image Prompt: ${i.imagePrompt}`,
    `Negative Prompt: ${i.negativePrompt}`,
  ].join("\n");
}

function ThumbnailPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const research = useResearch(selectedId);
  const pack = useThumbnails(selectedId);

  const gen = useServerFn(generateThumbnails);
  const regen = useServerFn(regenerateThumbnail);
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
      const ideas = (await gen({
        data: {
          topic: selected.topic,
          script: story?.script,
          angle: research?.storyAngles?.[0],
        },
      })) as ThumbnailIdea[];
      saveThumbnails({ topicId: selected.id, ideas, generatedAt: Date.now() });
      toast.success("Thumbnails generated");
    });
  }

  function handleRegen(index: number) {
    if (!selected || !pack) return;
    return withBusy(`i-${index}`, async () => {
      const updated = (await regen({
        data: { topic: selected.topic, idea: pack.ideas[index] },
      })) as ThumbnailIdea;
      const ideas = pack.ideas.map((it, i) => (i === index ? updated : it));
      saveThumbnails({ ...pack, ideas, generatedAt: Date.now() });
      toast.success("Idea regenerated");
    });
  }

  const allText = () =>
    !pack || !selected
      ? ""
      : `THUMBNAILS — ${selected.topic}\n\n${pack.ideas.map((it, i) => ideaToText(i, it)).join("\n\n")}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Steps current="thumbnail" />
      <h1 className="text-xl font-semibold">Thumbnail Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        High-CTR thumbnail concepts in MS Paint documentary style.
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
          {pack ? "Regenerate Thumbnails" : "Generate Thumbnails"}
        </Button>
      </div>

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">Select a topic to start.</p>
      )}

      {pack && selected && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => copyText(allText(), "All copied")}>
              Copy All
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadTxt(slugify(selected.topic) + "-thumbnails", allText())}
            >
              Download TXT
            </Button>
            <Button
              size="sm"
              onClick={() => downloadJson(slugify(selected.topic) + "-thumbnails", pack.ideas)}
            >
              Download JSON
            </Button>
          </div>

          <div className="space-y-3">
            {pack.ideas.map((it, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">
                    {i + 1}. {it.thumbnailTitle}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyText(it.imagePrompt, "Prompt copied")}
                    >
                      Copy Thumbnail Prompt
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRegen(i)}
                      disabled={!!busy}
                    >
                      {busy === `i-${i}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Regenerate Idea
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm">{it.mainVisualConcept}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Score label="CTR" value={it.ctrScore} />
                  <Meta label="Subject" value={it.mainSubject} />
                  <Meta label="Background" value={it.background} />
                  <Meta label="Emotion" value={it.emotion} />
                  <Meta label="Text" value={it.textOnThumbnail} />
                  <Meta label="Composition" value={it.composition} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Why it works: {it.whyItWorks}</p>
                <p className="mt-1 text-xs text-muted-foreground">Prompt: {it.imagePrompt}</p>
                <p className="mt-1 text-xs text-muted-foreground">Negative: {it.negativePrompt}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
