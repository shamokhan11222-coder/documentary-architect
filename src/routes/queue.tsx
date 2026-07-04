import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Pause, RotateCcw, ListChecks, ImagePlus, FastForward, CheckCircle2, XCircle, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useVisualMap } from "@/lib/store";
import { useQueue, saveQueue, readQueue, setQueueItem } from "@/lib/production";
import { generateSceneImage, imageErrorMessage, isRateLimitError, generateTestImage, IMAGE_SANITY_PROMPT, PROVIDER_FREE_TIER_LIMIT_MESSAGE, type ImageSanityResult } from "@/lib/generate-image";
import { putImage } from "@/lib/images";
import type { QueueItem, QueueStatus, VisualScene } from "@/lib/types";
import { SAFE_DELAY_OPTIONS, useSafeDelaySec, setSafeDelaySec, getSafeDelaySec, useFreeMode, setFreeMode, FREE_QUEUE_DELAY_SEC } from "@/lib/free-mode";

export const Route = createFileRoute("/queue")({
  head: () => ({ meta: [{ title: "Image Queue — Stickmax Studio" }] }),
  component: QueuePage,
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATUS_STYLE: Record<QueueStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  generating: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  "provider-limit": "bg-orange-500/15 text-orange-600 dark:text-orange-400",
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
  const freeMode = useFreeMode();
  const [currentScene, setCurrentScene] = useState<number | null>(null);
  const [rateMsg, setRateMsg] = useState<string>("");
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

  // Sequential runner. Saves each completed image immediately. Provider limits
  // stop the queue immediately and mark the scene Provider Limit, not Failed.
  async function runNumbers(nums: number[]) {
    if (!selected) return;
    const runList = freeMode ? nums.slice(0, 1) : nums;
    setRunning(true);
    pausedRef.current = false;
    setRateMsg("");
    const delayMs = (freeMode ? FREE_QUEUE_DELAY_SEC : getSafeDelaySec()) * 1000;

    for (let idx = 0; idx < runList.length; idx++) {
      if (pausedRef.current) break;
      const n = runList[idx];
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
          // Provider limit reached — do NOT retry or mark failed. Stop loading,
          // mark this scene Provider Limit, keep all completed work, and pause.
          setQueueItem(selected.id, { sceneNumber: n, status: "provider-limit", error: PROVIDER_FREE_TIER_LIMIT_MESSAGE });
          setRateMsg(PROVIDER_FREE_TIER_LIMIT_MESSAGE);
          toast.warning(PROVIDER_FREE_TIER_LIMIT_MESSAGE);
          pausedRef.current = true;
          break;
        }
        const msg = imageErrorMessage(e, "generation failed");
        setQueueItem(selected.id, { sceneNumber: n, status: "failed", error: msg });
        toast.error(`Scene ${n}: ${msg}`);
      }

      // advance resume cursor after a completed scene
      if (completed) {
        const q = readQueue(selected.id);
        if (q) saveQueue({ ...q, cursor: Math.max(q.cursor, n) });
      }
      // Wait between requests (never parallel), except after the last item.
      if (!pausedRef.current && idx < runList.length - 1) await sleep(delayMs);
    }
    setRunning(false);
    setCurrentScene(null);
    if (!pausedRef.current) toast.success("Batch complete");
  }

  function pendingNums(): number[] {
    const q = readQueue(selected?.id ?? "");
    if (!q) return [];
    return q.items
      .filter((i) => i.status === "pending" || i.status === "generating" || i.status === "provider-limit" || i.status === "rate-limited")
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
      .filter((i) => i.status === "failed" || i.status === "provider-limit" || i.status === "rate-limited")
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
  const providerLimited = (counts["provider-limit"] ?? 0) + (counts["rate-limited"] ?? 0);
  const pending = (counts.pending ?? 0) + (counts.generating ?? 0);
  const waiting = pending + providerLimited;
  // Rough ETA: remaining scenes × (delay + ~10s average generation time).
  const etaSec = waiting * ((freeMode ? FREE_QUEUE_DELAY_SEC : delaySec) + 10);
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
            <Stat label="Provider Limit" value={providerLimited} />
            <Stat label="Failed" value={failed} />
          </div>
          {waiting > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Est. time left: {fmtEta(etaSec)}</p>
          )}

          {rateMsg && (
            <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">{rateMsg}</div>
          )}

          <label className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-input"
              checked={freeMode}
              onChange={(e) => setFreeMode(e.target.checked)}
            />
            <span>
              <span className="font-medium">Free Queue Mode</span>
              <span className="ml-2 text-muted-foreground">
                1 image at a time, 120 seconds between requests, no parallel requests, Generate All and Generate Next 5 disabled.
              </span>
            </span>
          </label>

          {/* Required image sanity test — batch generation is locked until this
              produces ONE image with the active provider. */}
          <div className="mt-4 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FlaskConical className="h-4 w-4" /> Image Sanity Test
              </div>
              <Button size="sm" onClick={runSanityTest} disabled={testing}>
                {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="mr-1 h-3.5 w-3.5" />}
                Generate 1 Test Image
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Prompt: “{IMAGE_SANITY_PROMPT}”. Batch buttons unlock only after this succeeds.
            </p>
            {test && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[auto,1fr]">
                {test.image && (
                  <img src={test.image} alt="Test" className="h-24 w-24 rounded-md border border-border object-cover" />
                )}
                <div className="text-xs">
                  <div className={`flex items-center gap-1.5 font-medium ${test.ok ? "text-green-600" : "text-red-600"}`}>
                    {test.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {test.ok ? "Success" : "Failed"}
                  </div>
                  <div className="mt-1.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span>Provider</span><span className="font-medium text-foreground">{test.provider}</span>
                    <span>Model</span><span className="font-medium text-foreground">{test.model}</span>
                    <span>Request time</span><span className="font-medium text-foreground">{(test.ms / 1000).toFixed(1)}s</span>
                  </div>
                  {!test.ok && test.error && (
                    <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-red-600">
                      {test.rateLimited ? "Provider rate limit: " : "Error: "}{test.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!testPassed && (
            <p className="mt-3 text-xs text-amber-600">
              Run the sanity test above and get one successful image before batch generation unlocks.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={startSafeQueue} disabled={running || !testPassed || freeMode}>
              {running && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Generate All
            </Button>
            {running ? (
              <Button size="sm" variant="secondary" onClick={pause}>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause Queue
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={startSafeQueue} disabled={!testPassed}>
                <Play className="mr-1 h-3.5 w-3.5" /> {freeMode ? "Resume Later" : "Resume Queue"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={continueFromLast} disabled={running || !testPassed}>
              <FastForward className="mr-1 h-3.5 w-3.5" /> Continue From Last Scene
            </Button>
            <Button size="sm" variant="outline" onClick={generateOne} disabled={running || !testPassed}>
              <ImagePlus className="mr-1 h-3.5 w-3.5" /> Generate One Image
            </Button>
            <Button size="sm" variant="outline" onClick={generateNext5} disabled={running || !testPassed || freeMode}>
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
                  {i.status === "pending" ? "waiting" : i.status === "provider-limit" || i.status === "rate-limited" ? "Provider Limit" : i.status}
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
