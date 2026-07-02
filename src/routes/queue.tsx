import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Pause, RotateCcw, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useVisualMap } from "@/lib/store";
import { useQueue, saveQueue, readQueue, setQueueItem } from "@/lib/production";
import { generateSceneImage } from "@/lib/generate-image";
import { putImage } from "@/lib/images";
import type { QueueItem, QueueStatus, VisualScene } from "@/lib/types";

export const Route = createFileRoute("/queue")({
  head: () => ({ meta: [{ title: "Image Queue — Stickmax Studio" }] }),
  component: QueuePage,
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;

const STATUS_STYLE: Record<QueueStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  generating: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function QueuePage() {
  const { selected } = useSelectedProject();
  const map = useVisualMap(selected?.id ?? null);
  const queue = useQueue(selected?.id ?? null);
  const [running, setRunning] = useState(false);
  const pausedRef = useRef(false);
  const [selectedNums, setSelectedNums] = useState<Set<number>>(new Set());

  function buildQueue() {
    if (!selected || !map) return;
    const existing = queue?.items ?? [];
    const items: QueueItem[] = [...map.scenes]
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((s) => existing.find((i) => i.sceneNumber === s.sceneNumber) ?? { sceneNumber: s.sceneNumber, status: "pending" });
    saveQueue({ topicId: selected.id, items, cursor: queue?.cursor ?? 0, updatedAt: Date.now() });
    toast.success("Queue ready");
  }

  function sceneOf(n: number): VisualScene | undefined {
    return map?.scenes.find((s) => s.sceneNumber === n);
  }

  async function runNumbers(nums: number[]) {
    if (!selected) return;
    setRunning(true);
    pausedRef.current = false;
    for (const n of nums) {
      if (pausedRef.current) break;
      const scene = sceneOf(n);
      if (!scene) continue;
      setQueueItem(selected.id, { sceneNumber: n, status: "generating" });
      try {
        const url = await generateSceneImage(scene);
        await putImage(sceneImageId(selected.id, n), url);
        setQueueItem(selected.id, { sceneNumber: n, status: "completed" });
      } catch (e) {
        setQueueItem(selected.id, { sceneNumber: n, status: "failed", error: e instanceof Error ? e.message : "failed" });
        toast.error(`Scene ${n}: ${e instanceof Error ? e.message : "failed"}`);
      }
      // advance resume cursor
      const q = readQueue(selected.id);
      if (q) saveQueue({ ...q, cursor: Math.max(q.cursor, n) });
    }
    setRunning(false);
    if (!pausedRef.current) toast.success("Batch complete");
  }

  function generateNext10() {
    const q = readQueue(selected?.id ?? "");
    if (!q) return;
    const nums = q.items.filter((i) => i.status === "pending" || i.status === "generating").slice(0, 10).map((i) => i.sceneNumber);
    if (!nums.length) return toast.info("Nothing pending");
    void runNumbers(nums);
  }
  function retryFailed() {
    const q = readQueue(selected?.id ?? "");
    if (!q) return;
    const nums = q.items.filter((i) => i.status === "failed").map((i) => i.sceneNumber);
    if (!nums.length) return toast.info("No failed items");
    void runNumbers(nums);
  }
  function retrySelected() {
    const nums = [...selectedNums].sort((a, b) => a - b);
    if (!nums.length) return toast.info("Select scenes first");
    void runNumbers(nums);
  }
  function pause() {
    pausedRef.current = true;
    setRunning(false);
    toast.info("Paused — progress saved. Continue any time.");
  }

  const counts = (queue?.items ?? []).reduce(
    (acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }),
    {} as Record<QueueStatus, number>,
  );

  function toggleSel(n: number) {
    setSelectedNums((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Image Queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate storyboard images in resilient batches. Progress is saved — close and continue exactly where you stopped, never from scene 1.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ProjectPicker />
        <Button onClick={buildQueue} disabled={!selected || !map} variant={queue ? "secondary" : "default"}>
          <ListChecks className="mr-2 h-4 w-4" /> {queue ? "Sync Queue" : "Build Queue"}
        </Button>
      </div>

      {selected && !map && <p className="mt-4 text-xs text-amber-600">Build a storyboard first (Images page).</p>}

      {queue && (
        <>
          {queue.cursor > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-card p-3 text-sm">
              <span className="text-muted-foreground">Resume point:</span> last reached{" "}
              <span className="font-semibold">Scene {queue.cursor}</span>. Next batch continues from the next pending scene.
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Pending" value={counts.pending ?? 0} />
            <Stat label="Generating" value={counts.generating ?? 0} />
            <Stat label="Completed" value={counts.completed ?? 0} />
            <Stat label="Failed" value={counts.failed ?? 0} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={generateNext10} disabled={running}>
              {running && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Generate Next 10
            </Button>
            {running ? (
              <Button size="sm" variant="secondary" onClick={pause}>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={generateNext10}>
                <Play className="mr-1 h-3.5 w-3.5" /> Resume
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={retryFailed} disabled={running}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry Failed
            </Button>
            <Button size="sm" variant="ghost" onClick={retrySelected} disabled={running}>
              Retry Selected ({selectedNums.size})
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {queue.items.map((i) => (
              <button
                key={i.sceneNumber}
                onClick={() => toggleSel(i.sceneNumber)}
                className={[
                  "flex items-center justify-between rounded-lg border p-2 text-left text-sm transition-colors",
                  selectedNums.has(i.sceneNumber) ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                ].join(" ")}
              >
                <span className="font-medium">Scene {i.sceneNumber}</span>
                <span className={["rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[i.status]].join(" ")}>
                  {i.status}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
