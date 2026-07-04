import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Pause, RotateCcw, ListChecks, ImagePlus, FastForward, CheckCircle2, XCircle, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useVisualMap } from "@/lib/store";
import { useQueue, saveQueue, readQueue, setQueueItem } from "@/lib/production";
import { generateSceneImage, isRateLimitError, generateTestImage, IMAGE_SANITY_PROMPT, type ImageSanityResult } from "@/lib/generate-image";
import { putImage } from "@/lib/images";
import type { QueueItem, QueueStatus, VisualScene } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";
import { SAFE_DELAY_OPTIONS, useSafeDelaySec, setSafeDelaySec, getSafeDelaySec } from "@/lib/free-mode";

export const Route = createFileRoute("/queue")({
  head: () => ({ meta: [{ title: "Image Queue — Stickmax Studio" }] }),
  component: QueuePage,
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// If this many scenes hit the provider limit in one run, assume the daily quota
// is exhausted and surface a stronger message.
const REPEAT_LIMIT_THRESHOLD = 3;

const STATUS_STYLE: Record<QueueStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  generating: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  "rate-limited": "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

function QueuePage() {
  const { selected } = useSelectedProject();
  const map = useVisualMap(selected?.id ?? null);
  const queue = useQueue(selected?.id ?? null);
  const [running, setRunning] = useState(false);
  const pausedRef = useRef(false);
  const [selectedNums, setSelectedNums] = useState<Set<number>>(new Set());
  const delaySec = useSafeDelaySec();
  const [currentScene, setCurrentScene] = useState<number | null>(null);
  const [rateMsg, setRateMsg] = useState<string>("");
  const rateHitsRef = useRef(0);
  // Required image sanity test. Batch generation stays locked until ONE test
  // image succeeds with the active provider.
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<ImageSanityResult | null>(null);
  const testPassed = test?.ok === true;

  async function runSanityTest() {
    setTesting(true);
    setTest(null);
    try {
      const r = await generateTestImage();
      setTest(r);
      if (r.ok) toast.success(`Test image OK via ${r.provider} (${(r.ms / 1000).toFixed(1)}s)`);
      else toast.error(r.error ?? "Test image failed");
    } finally {
      setTesting(false);
    }
  }

  function buildQueue() {
    if (!selected || !map) return;
    const existing = queue?.items ?? [];
    const items: QueueItem[] = [...map.scenes]
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((s) => {
        const ex = existing.find((i) => i.sceneNumber === s.sceneNumber);
        if (!ex) return { sceneNumber: s.sceneNumber, status: "pending" };
        // A tab closed mid-run leaves items stuck in "generating"; reset them to
        // "pending" so they are picked up again instead of frozen.
        if (ex.status === "generating") return { ...ex, status: "pending" as const };
        return ex;
      });
    saveQueue({ topicId: selected.id, items, cursor: queue?.cursor ?? 0, updatedAt: Date.now() });
    toast.success("Queue ready");
  }

  function sceneOf(n: number): VisualScene | undefined {
    return map?.scenes.find((s) => s.sceneNumber === n);
  }

  // Slow, safe, sequential runner. Generates ONE image at a time, waits the
  // configured delay between requests, saves each image immediately, and on a
  // Gemini rate limit retries after 30s → 60s → 120s before pausing (so scenes
  // are never permanently failed and the queue resumes from where it stopped).
  async function runNumbers(nums: number[]) {
    if (!selected) return;
    setRunning(true);
    pausedRef.current = false;
    setRateMsg("");
    rateHitsRef.current = 0;
    const delayMs = getSafeDelaySec() * 1000;

    for (let idx = 0; idx < nums.length; idx++) {
      if (pausedRef.current) break;
      const n = nums[idx];
      const scene = sceneOf(n);
      if (!scene) continue;
      setCurrentScene(n);
      setQueueItem(selected.id, { sceneNumber: n, status: "generating" });

      let completed = false;
      try {
        const url = await generateSceneImage(scene);
        await putImage(sceneImageId(selected.id, n), url);
        setQueueItem(selected.id, { sceneNumber: n, status: "completed" });
        setRateMsg("");
        completed = true;
      } catch (e) {
        if (isRateLimitError(e)) {
          // Provider limit reached — do NOT wait or mark failed. Stop loading,
          // mark this scene "Rate Limited" (resumable), keep all completed work,
          // and pause the queue automatically so the user can resume later.
          rateHitsRef.current += 1;
          setQueueItem(selected.id, { sceneNumber: n, status: "rate-limited" });
          if (rateHitsRef.current >= REPEAT_LIMIT_THRESHOLD) {
            setRateMsg("Daily provider limit likely reached. Try again later or switch provider.");
            toast.warning("Daily provider limit likely reached. Try again later or switch provider.");
          } else {
            setRateMsg("Gemini image limit reached. Resume later.");
            toast.warning("Gemini image limit reached. Resume later.");
          }
          pausedRef.current = true;
          break;
        }
        setQueueItem(selected.id, { sceneNumber: n, status: "failed", error: humanizeError(e, "failed") });
        toast.error(`Scene ${n}: ${humanizeError(e, "generation failed")}`);
      }

      // advance resume cursor after a completed scene
      if (completed) {
        const q = readQueue(selected.id);
        if (q) saveQueue({ ...q, cursor: Math.max(q.cursor, n) });
      }
      // Wait between requests (never parallel), except after the last item.
      if (!pausedRef.current && idx < nums.length - 1) await sleep(delayMs);
    }
    setRunning(false);
    setCurrentScene(null);
    if (!pausedRef.current) toast.success("Batch complete");
  }

  function pendingNums(): number[] {
    const q = readQueue(selected?.id ?? "");
    if (!q) return [];
    return q.items
      .filter((i) => i.status === "pending" || i.status === "generating" || i.status === "rate-limited")
      .map((i) => i.sceneNumber)
      .sort((a, b) => a - b);
  }

  function startSafeQueue() {
    const nums = pendingNums();
    if (!nums.length) return toast.info("Nothing pending");
    void runNumbers(nums);
  }

  function continueFromLast() {
    const q = readQueue(selected?.id ?? "");
    if (!q) return;
    const nums = pendingNums().filter((n) => n >= q.cursor);
    if (!nums.length) return toast.info("Nothing left to continue");
    void runNumbers(nums);
  }

  function generateOne() {
    const nums = pendingNums();
    if (!nums.length) return toast.info("Nothing pending");
    void runNumbers([nums[0]]);
  }

  function generateNext5() {
    const nums = pendingNums();
    if (!nums.length) return toast.info("Nothing pending");
    void runNumbers(nums.slice(0, 5));
  }

  // Retry the scene that was interrupted (first not-yet-completed scene).
  function retryCurrent() {
    const nums = pendingNums();
    if (!nums.length) return toast.info("Nothing to retry");
    void runNumbers([nums[0]]);
  }

  function retryFailed() {
    const q = readQueue(selected?.id ?? "");
    if (!q) return;
    const nums = q.items
      .filter((i) => i.status === "failed" || i.status === "rate-limited")
      .map((i) => i.sceneNumber);
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
  const total = queue?.items.length ?? 0;
  const completed = counts.completed ?? 0;
  const failed = counts.failed ?? 0;
  const rateLimited = counts["rate-limited"] ?? 0;
  const pending = (counts.pending ?? 0) + (counts.generating ?? 0);
  const waiting = pending + rateLimited;
  // Rough ETA: remaining scenes × (delay + ~10s average generation time).
  const etaSec = waiting * (delaySec + 10);
  const fmtEta = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

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

          {/* Slow safe mode: one image at a time with a configurable delay. */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <span className="text-muted-foreground">Delay between images:</span>
            {SAFE_DELAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setSafeDelaySec(d)}
                className={[
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  delaySec === d ? "border-primary bg-primary/10 font-medium" : "border-input hover:bg-accent",
                ].join(" ")}
              >
                {d}s
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Current Scene" value={currentScene ?? "—"} />
            <Stat label="Total Scenes" value={total} />
            <Stat label="Completed" value={completed} />
            <Stat label="Pending" value={pending} />
            <Stat label="Rate Limited" value={rateLimited} />
            <Stat label="Failed" value={failed} />
          </div>
          {waiting > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Est. time left: {fmtEta(etaSec)}</p>
          )}

          {rateMsg && (
            <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">{rateMsg}</div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={startSafeQueue} disabled={running || !testPassed}>
              {running && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Generate All
            </Button>
            {running ? (
              <Button size="sm" variant="secondary" onClick={pause}>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause Queue
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={startSafeQueue} disabled={!testPassed}>
                <Play className="mr-1 h-3.5 w-3.5" /> Resume Queue
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={continueFromLast} disabled={running || !testPassed}>
              <FastForward className="mr-1 h-3.5 w-3.5" /> Continue From Last Scene
            </Button>
            <Button size="sm" variant="outline" onClick={generateOne} disabled={running || !testPassed}>
              <ImagePlus className="mr-1 h-3.5 w-3.5" /> Generate Next 1
            </Button>
            <Button size="sm" variant="outline" onClick={generateNext5} disabled={running || !testPassed}>
              <ImagePlus className="mr-1 h-3.5 w-3.5" /> Generate Next 5
            </Button>
            <Button size="sm" variant="ghost" onClick={retryCurrent} disabled={running || !testPassed}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry Current
            </Button>
            <Button size="sm" variant="ghost" onClick={retryFailed} disabled={running || !testPassed}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry Failed
            </Button>
            <Button size="sm" variant="ghost" onClick={retrySelected} disabled={running || !testPassed}>
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
                  {i.status === "pending" ? "waiting" : i.status === "rate-limited" ? "rate limited" : i.status}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
