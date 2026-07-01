import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Check, Sparkles, Code } from "lucide-react";

import { generateThumbnails, regenerateThumbnail, reviewThumbnails } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useResearch,
  useThumbnails,
  saveThumbnails,
} from "@/lib/store";
import { useImage, putImage } from "@/lib/images";
import { generateThumbnailImage } from "@/lib/generate-image";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { Steps } from "@/components/Steps";
import { Feedback } from "@/components/Feedback";
import type { ThumbnailIdea, ThumbnailReview } from "@/lib/types";

export const Route = createFileRoute("/thumbnail")({
  head: () => ({ meta: [{ title: "Thumbnail — Documentary Studio" }] }),
  component: ThumbnailPage,
});

const thumbImageId = (topicId: string, i: number) => `thumb:${topicId}:${i}`;

function ThumbnailPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const research = useResearch(selectedId);
  const pack = useThumbnails(selectedId);

  const gen = useServerFn(generateThumbnails);
  const regen = useServerFn(regenerateThumbnail);
  const doReview = useServerFn(reviewThumbnails);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dev, setDev] = useState(false);
  const [review, setReview] = useState<ThumbnailReview | null>(null);

  function handleReview() {
    if (!selected || !pack) return;
    return withBusy("review", async () => {
      const r = (await doReview({ data: { topic: selected.topic, ideas: pack.ideas } })) as ThumbnailReview;
      setReview(r);
      toast.success("Reviewed — strongest thumbnail highlighted");
    });
  }

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
        data: { topic: selected.topic, script: story?.script, angle: research?.storyAngles?.[0] },
      })) as ThumbnailIdea[];
      saveThumbnails({ topicId: selected.id, ideas, generatedAt: Date.now() });
      setProgress({ done: 0, total: ideas.length });
      for (let i = 0; i < ideas.length; i++) {
        try {
          const url = await generateThumbnailImage(ideas[i]);
          await putImage(thumbImageId(selected.id, i), url);
        } catch (e) {
          toast.error(`Thumbnail ${i + 1}: ${e instanceof Error ? e.message : "failed"}`);
        }
        setProgress({ done: i + 1, total: ideas.length });
      }
      setProgress(null);
      toast.success("Thumbnails generated");
    });
  }

  function handleRegen(index: number) {
    if (!selected || !pack) return;
    return withBusy(`i-${index}`, async () => {
      const updated = (await regen({ data: { topic: selected.topic, idea: pack.ideas[index] } })) as ThumbnailIdea;
      const ideas = pack.ideas.map((it, i) => (i === index ? updated : it));
      saveThumbnails({ ...pack, ideas, generatedAt: Date.now() });
      const url = await generateThumbnailImage(updated);
      await putImage(thumbImageId(selected.id, index), url);
      toast.success("Thumbnail regenerated");
    });
  }

  function handleChoose(index: number) {
    if (!pack) return;
    saveThumbnails({ ...pack, ideas: pack.ideas.map((it, i) => ({ ...it, chosen: i === index })) });
    toast.success("Thumbnail chosen");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Steps current="thumbnail" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Thumbnail Engine</h1>
        <Button size="sm" variant="ghost" onClick={() => setDev((v) => !v)}>
          <Code className="mr-1 h-4 w-4" /> {dev ? "Hide" : "Developer"} Mode
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Real generated thumbnail concepts with CTR scoring. No prompts — just pick a winner.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedTopicId(e.target.value || null)}
        >
          <option value="">Select a project…</option>
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
        {pack && (
          <Button variant="outline" onClick={handleReview} disabled={!!busy}>
            {busy === "review" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Review Thumbnails
          </Button>
        )}
      </div>

      {review && (
        <p className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Recommended: #{review.recommendedIndex + 1}.</strong>{" "}
          {review.reason}
        </p>
      )}

      {progress && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">
            Generating thumbnails… {progress.done}/{progress.total}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {!selected && <p className="mt-6 text-sm text-muted-foreground">Select a project to start.</p>}

      {pack && selected && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pack.ideas.map((it, i) => (
            <ThumbCard
              key={i}
              idea={it}
              index={i}
              topicId={selected.id}
              busy={busy}
              dev={dev}
              scored={review?.scored.find((s) => s.index === i) ?? null}
              recommended={review?.recommendedIndex === i}
              onRegen={() => handleRegen(i)}
              onChoose={() => handleChoose(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThumbCard({
  idea,
  index,
  topicId,
  busy,
  dev,
  scored,
  recommended,
  onRegen,
  onChoose,
}: {
  idea: ThumbnailIdea;
  index: number;
  topicId: string;
  busy: string | null;
  dev: boolean;
  scored: ThumbnailReview["scored"][number] | null;
  recommended: boolean;
  onRegen: () => void;
  onChoose: () => void;
}) {
  const img = useImage(thumbImageId(topicId, index));
  const working = busy === `i-${index}`;
  return (
    <div className={`overflow-hidden rounded-xl border ${idea.chosen || recommended ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <div className="relative flex aspect-video items-center justify-center bg-muted/30">
        {img ? (
          <img src={img} alt={idea.thumbnailTitle} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No image</span>
        )}
        {working && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {recommended && (
          <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            Recommended
          </span>
        )}
        {idea.chosen && (
          <span className="absolute right-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            Chosen
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium">{idea.thumbnailTitle}</div>
          <Feedback kind="thumbnail" content={`${idea.thumbnailTitle} — ${idea.mainVisualConcept}`} topicId={topicId} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Score label="CTR" value={idea.ctrScore} />
          <Meta label="Emotion" value={idea.emotion} />
          <Meta label="Composition" value={idea.composition} />
        </div>
        {scored && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Score label="Read" value={scored.readability} />
            <Score label="Curiosity" value={scored.curiosity} />
            <Score label="Overall" value={scored.overall} />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{idea.whyItWorks}</p>
        {dev && (
          <p className="mt-2 rounded bg-muted p-2 text-[11px] text-muted-foreground">
            Prompt: {idea.imagePrompt}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" onClick={onChoose} disabled={!!busy}>
            <Check className="mr-1 h-3.5 w-3.5" /> Choose
          </Button>
          <Button size="sm" variant="secondary" onClick={onRegen} disabled={!!busy}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
          </Button>
          <Button size="sm" variant="ghost" onClick={onRegen} disabled={!!busy}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Upscale
          </Button>
        </div>
      </div>
    </div>
  );
}
