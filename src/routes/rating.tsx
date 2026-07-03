import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { rateVideo, improveWeakPoints } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useVisualMap,
  useThumbnails,
  useRating,
  saveRating,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score } from "@/components/Score";
import { StatusBadge } from "@/components/StatusBadge";
import { StageShell } from "@/components/StageShell";
import { copyText, downloadTxt, slugify } from "@/lib/io";
import type { RatingReport } from "@/lib/types";

export const Route = createFileRoute("/rating")({
  head: () => ({ meta: [{ title: "Rating — Stickmax Studio" }] }),
  component: RatingPage,
});

function reportToText(topic: string, r: RatingReport): string {
  return [
    `RATING REPORT — ${topic}`,
    "",
    `Hook: ${r.hookScore}/10`,
    `Story: ${r.storyScore}/10`,
    `Retention: ${r.retentionScore}/10`,
    `Visual Clarity: ${r.visualClarityScore}/10`,
    `Thumbnail CTR: ${r.thumbnailCtrScore}/10`,
    `Originality: ${r.originalityScore}/10`,
    `Evergreen: ${r.evergreenScore}/10`,
    `OVERALL: ${r.overallScore}/10`,
    "",
    `CTR PREDICTION: ${r.ctrPrediction ?? "—"}`,
    `RETENTION PREDICTION: ${r.retentionPrediction ?? "—"}`,
    `WEAKEST PART: ${r.weakestPart ?? "—"}`,
    `BEST PART: ${r.bestPart ?? "—"}`,
    "",
    `RECOMMENDATION: ${r.recommendation}`,
    "",
    "STRONG POINTS:",
    ...r.strongPoints.map((s) => `- ${s}`),
    "",
    "WEAK POINTS:",
    ...r.weakPoints.map((s) => `- ${s}`),
    "",
    "WHAT TO IMPROVE:",
    ...r.whatToImprove.map((s) => `- ${s}`),
  ].join("\n");
}

function RatingPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const visual = useVisualMap(selectedId);
  const thumbs = useThumbnails(selectedId);
  const rating = useRating(selectedId);

  const rate = useServerFn(rateVideo);
  const improve = useServerFn(improveWeakPoints);
  const [busy, setBusy] = useState<string | null>(null);
  const [improvements, setImprovements] = useState<string>("");

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

  function handleRate() {
    if (!selected) return;
    return withBusy("rate", async () => {
      const data = (await rate({
        data: {
          topic: selected.topic,
          hook: story?.script?.slice(0, 600),
          script: story?.script,
          visualMap: visual?.scenes
            ?.map((s) => `${s.sceneNumber}. ${s.visualDescription}`)
            .join("\n"),
          thumbnails: thumbs?.ideas?.map((t) => t.thumbnailTitle).join("; "),
        },
      })) as Omit<RatingReport, "topicId" | "generatedAt">;
      saveRating({ ...data, topicId: selected.id, generatedAt: Date.now() });
      toast.success("Video rated");
    });
  }

  function handleImprove() {
    if (!selected || !rating) return;
    return withBusy("improve", async () => {
      const { text } = await improve({
        data: { topic: selected.topic, weakPoints: rating.weakPoints },
      });
      setImprovements(text);
      toast.success("Improvement plan ready");
    });
  }

  const recStatus = (r: string) =>
    r === "Ready" ? "Completed" : r === "Needs Rewrite" ? "Needs Review" : "In Progress";

  return (
    <StageShell stage="rating" maxWidth="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Rating Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Score the video before production and get a recommendation.
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
        <Button onClick={handleRate} disabled={!selected || !!busy}>
          {busy === "rate" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {rating ? "Re-rate Video" : "Rate Video"}
        </Button>
      </div>

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">Select a topic to start.</p>
      )}

      {rating && selected && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={recStatus(rating.recommendation) as "Completed"} />
            <span className="text-sm font-medium">{rating.recommendation}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Score label="Hook" value={rating.hookScore} />
            <Score label="Story" value={rating.storyScore} />
            <Score label="Retention" value={rating.retentionScore} />
            <Score label="Visual" value={rating.visualClarityScore} />
            <Score label="Thumbnail" value={rating.thumbnailCtrScore} />
            <Score label="Originality" value={rating.originalityScore} />
            <Score label="Evergreen" value={rating.evergreenScore} />
            <Score label="Overall" value={rating.overallScore} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleImprove} disabled={!!busy}>
              {busy === "improve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Improve Weak Points
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copyText(reportToText(selected.topic, rating), "Report copied")}
            >
              Copy Report
            </Button>
            <Button
              size="sm"
              onClick={() =>
                downloadTxt(slugify(selected.topic) + "-rating", reportToText(selected.topic, rating))
              }
            >
              Download Report
            </Button>
          </div>

          <ListCard title="Strong Points" items={rating.strongPoints} />

          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h2 className="mb-1 text-sm font-semibold">CTR Prediction</h2>
              <p className="text-sm text-muted-foreground">{rating.ctrPrediction ?? "—"}</p>
            </section>
            <section className="rounded-lg border border-border p-4">
              <h2 className="mb-1 text-sm font-semibold">Retention Prediction</h2>
              <p className="text-sm text-muted-foreground">{rating.retentionPrediction ?? "—"}</p>
            </section>
            <section className="rounded-lg border border-green-600/30 p-4">
              <h2 className="mb-1 text-sm font-semibold">Best Part</h2>
              <p className="text-sm text-muted-foreground">{rating.bestPart ?? "—"}</p>
            </section>
            <section className="rounded-lg border border-red-600/30 p-4">
              <h2 className="mb-1 text-sm font-semibold">Weakest Part</h2>
              <p className="text-sm text-muted-foreground">{rating.weakestPart ?? "—"}</p>
            </section>
          </div>

          <ListCard title="Weak Points" items={rating.weakPoints} />
          <ListCard title="What To Improve" items={rating.whatToImprove} />

          {improvements && (
            <section className="rounded-lg border border-border p-4">
              <h2 className="mb-2 text-sm font-semibold">Improvement Plan</h2>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{improvements}</pre>
            </section>
          )}
        </div>
      )}
    </StageShell>
  );
}

function ListCard({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}
