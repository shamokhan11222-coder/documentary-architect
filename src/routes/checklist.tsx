import { createFileRoute } from "@tanstack/react-router";

import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useProjectStatus, useStory, useVisualMap, useThumbnails, useRating } from "@/lib/store";
import { useVoice, useQueue, estimateSeconds, fmtClock } from "@/lib/production";

export const Route = createFileRoute("/checklist")({
  head: () => ({ meta: [{ title: "Checklist — Stickmax Studio" }] }),
  component: ChecklistPage,
});

const STEPS: { key: string; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "story", label: "Story" },
  { key: "visual", label: "Storyboard" },
  { key: "images", label: "Images" },
  { key: "voice", label: "Voice" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "seo", label: "SEO" },
  { key: "rating", label: "Rating" },
];

function ChecklistPage() {
  const { selected } = useSelectedProject();
  const id = selected?.id ?? null;
  const status = useProjectStatus(id);
  const story = useStory(id);
  const map = useVisualMap(id);
  const voice = useVoice(id);
  const queue = useQueue(id);
  const thumbs = useThumbnails(id);
  const rating = useRating(id);

  const completedImages = queue?.items.filter((i) => i.status === "completed").length ?? 0;
  const failedImages = queue?.items.filter((i) => i.status === "failed").length ?? 0;
  const sceneCount = map?.scenes.length ?? 0;
  const words = story ? (story.script.match(/\S+/g) ?? []).length : 0;
  const estDuration = story ? estimateSeconds(story.script) : 0;
  const voiceDuration = (voice?.blocks ?? []).reduce((s, b) => s + (b.realSeconds ?? b.estSeconds), 0);

  const done: Record<string, boolean> = {
    research: status.research,
    story: status.story,
    visual: status.visual,
    images: completedImages > 0 && completedImages >= sceneCount && sceneCount > 0,
    voice: !!voice?.blocks.some((b) => b.generatedAt),
    thumbnail: status.thumbnail,
    seo: status.seo,
    rating: status.rating,
  };
  const doneCount = STEPS.filter((s) => done[s.key]).length;
  const pct = Math.round((doneCount / STEPS.length) * 100);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">Production Checklist</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track everything needed before export.</p>

      <div className="mt-4"><ProjectPicker /></div>

      {selected && (
        <>
          <div className="mt-5 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Completion</span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {STEPS.map((s) => (
                <div key={s.key} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                  <span className={["flex h-5 w-5 items-center justify-center rounded-full text-[11px]", done[s.key] ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"].join(" ")}>
                    {done[s.key] ? "✓" : ""}
                  </span>
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          <h2 className="mt-6 text-sm font-semibold">Project Stats</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Script Words" value={String(words)} />
            <Stat label="Est. Duration" value={fmtClock(estDuration)} />
            <Stat label="Scenes" value={String(sceneCount)} />
            <Stat label="Images Done" value={String(completedImages)} />
            <Stat label="Failed Images" value={String(failedImages)} />
            <Stat label="Voice Duration" value={fmtClock(voiceDuration)} />
            <Stat label="Thumbnails" value={String(thumbs?.ideas.length ?? 0)} />
            <Stat label="Rating" value={rating ? `${rating.overallScore}/10` : "—"} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
