// Live image-generation queue panel: controls + status + cooling keys.
import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, SkipForward, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useImageQueue,
  pauseImageQueue,
  resumeImageQueue,
  retryFailedImages,
  continueFromLastImage,
  setQueueDelay,
  DELAY_OPTIONS,
} from "@/lib/image-queue";
import { useGeminiImageKeys } from "@/lib/gemini-image-keys";

function useNow(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function fmt(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function ImageQueuePanel({ onStart }: { onStart: () => void }) {
  const q = useImageQueue();
  const keys = useGeminiImageKeys();
  useNow(q.state === "cooling" || q.state === "running" || keys.some((k) => k.status === "cooling"));

  const cooling = keys.filter((k) => k.status === "cooling");
  const running = q.state === "running" || q.state === "cooling";

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Image Queue (Gemini rotation)</div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={onStart} disabled={running}>
            <Play className="mr-1 h-4 w-4" /> Start Queue
          </Button>
          {q.state === "running" || q.state === "cooling" ? (
            <Button size="sm" variant="outline" onClick={pauseImageQueue}>
              <Pause className="mr-1 h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={resumeImageQueue} disabled={q.state !== "paused"}>
              <Play className="mr-1 h-4 w-4" /> Resume
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={retryFailedImages} disabled={q.failed === 0}>
            <RotateCcw className="mr-1 h-4 w-4" /> Retry Failed
          </Button>
          <Button size="sm" variant="outline" onClick={continueFromLastImage}>
            <SkipForward className="mr-1 h-4 w-4" /> Continue From Last
          </Button>
        </div>
      </div>

      {/* Delay between requests */}
      <div className="mt-3">
        <div className="text-xs font-medium text-muted-foreground">Delay between images</div>
        <div className="mt-1 flex gap-2">
          {DELAY_OPTIONS.map((ms) => (
            <button
              key={ms}
              onClick={() => setQueueDelay(ms)}
              className={`rounded-md border px-3 py-1.5 text-xs transition ${
                q.delayMs === ms ? "border-primary bg-primary/10" : "border-input bg-background hover:bg-muted"
              }`}
            >
              {ms / 1000}s
            </button>
          ))}
        </div>
      </div>

      {/* Live status */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Current scene" value={q.currentScene != null ? `#${q.currentScene}` : "—"} />
        <Stat label="Active key" value={q.activeKeyName ?? "—"} />
        <Stat label="Provider / model" value={q.activeModel ? `Gemini · ${q.activeModel}` : "—"} />
        <Stat label="Completed" value={String(q.completed)} cls="text-green-600" />
        <Stat label="Pending" value={String(q.pending)} />
        <Stat label="Failed" value={String(q.failed)} cls={q.failed ? "text-red-600" : undefined} />
        <Stat label="Cooling keys" value={String(cooling.length)} cls={cooling.length ? "text-amber-600" : undefined} />
        <Stat
          label="Next retry"
          value={q.nextRetryAt ? fmt(q.nextRetryAt - Date.now()) : "—"}
        />
        <Stat label="State" value={q.state} />
      </div>

      {q.state === "cooling" && (
        <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          All Gemini image keys are cooling down. Resume automatically when one becomes available.
        </div>
      )}
      {q.message && q.state !== "cooling" && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{q.message}</div>
      )}

      {cooling.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Cooling down</div>
          {cooling.map((k) => (
            <div key={k.id} className="flex items-center justify-between text-xs">
              <span className="truncate">{k.name}</span>
              <span className="text-amber-600">
                {k.cooldownUntil ? fmt(k.cooldownUntil - Date.now()) : "—"} (fails: {k.failCount})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
      <div className={`truncate text-sm font-semibold ${cls ?? ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
