import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useVisualMap } from "@/lib/store";
import { estimateSeconds, fmtClock, fmtTimestamp } from "@/lib/production";
import { useImage } from "@/lib/images";
import type { VisualScene } from "@/lib/types";

export const Route = createFileRoute("/timeline")({
  head: () => ({ meta: [{ title: "Timeline — Stickmax Studio" }] }),
  component: TimelinePage,
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;

function TimelinePage() {
  const { selected } = useSelectedProject();
  const map = useVisualMap(selected?.id ?? null);
  const [active, setActive] = useState<number | null>(null);

  const scenes = map ? [...map.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber) : [];
  let clock = 0;
  const rows = scenes.map((s) => {
    const dur = estimateSeconds(s.voiceoverLine);
    const start = clock;
    clock += dur;
    return { scene: s, start, dur };
  });
  const total = clock;
  const activeScene = scenes.find((s) => s.sceneNumber === active) ?? null;
  const activeRow = rows.find((r) => r.scene.sceneNumber === active) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Timeline</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Voice, storyboard, images and duration for every scene. Click any scene to inspect it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ProjectPicker />
        {map && (
          <span className="text-xs text-muted-foreground">
            {scenes.length} scenes · est. duration <span className="font-medium text-foreground">{fmtClock(total)}</span>
          </span>
        )}
      </div>

      {selected && !map && <p className="mt-4 text-xs text-amber-600">Build a storyboard first (Images page).</p>}

      {map && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((r) => (
              <TimelineRow
                key={r.scene.sceneNumber}
                topicId={selected!.id}
                scene={r.scene}
                start={r.start}
                dur={r.dur}
                active={active === r.scene.sceneNumber}
                onClick={() => setActive(r.scene.sceneNumber)}
              />
            ))}
          </div>

          <div className="lg:sticky lg:top-6 h-fit rounded-xl border border-border p-4">
            {activeScene && activeRow ? (
              <SceneDetail topicId={selected!.id} scene={activeScene} start={activeRow.start} dur={activeRow.dur} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a scene to see details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  topicId,
  scene,
  start,
  dur,
  active,
  onClick,
}: {
  topicId: string;
  scene: VisualScene;
  start: number;
  dur: number;
  active: boolean;
  onClick: () => void;
}) {
  const img = useImage(sceneImageId(topicId, scene.sceneNumber));
  return (
    <button
      onClick={onClick}
      className={["flex w-full items-center gap-3 p-2 text-left transition-colors", active ? "bg-primary/5" : "hover:bg-accent"].join(" ")}
    >
      <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTimestamp(start, ".").slice(0, 8)}</span>
      <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
        {img && <img src={img} alt="" className="h-full w-full object-cover" />}
      </div>
      <span className="flex-1 truncate text-sm">
        <span className="font-medium">#{scene.sceneNumber}</span> {scene.voiceoverLine}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{fmtClock(dur)}</span>
    </button>
  );
}

function SceneDetail({ topicId, scene, start, dur }: { topicId: string; scene: VisualScene; start: number; dur: number }) {
  const img = useImage(sceneImageId(topicId, scene.sceneNumber));
  return (
    <div className="space-y-2 text-sm">
      <div className="text-sm font-semibold">Scene {scene.sceneNumber}</div>
      <div className="aspect-video overflow-hidden rounded-lg bg-muted">
        {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <p className="italic">“{scene.voiceoverLine}”</p>
      <Detail label="Start" value={fmtClock(start)} />
      <Detail label="Length" value={fmtClock(dur)} />
      <Detail label="Shot" value={scene.cameraShot} />
      <Detail label="Emotion" value={scene.emotion} />
      <Detail label="Type" value={scene.sceneType} />
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
