// Queue status + controls panel. Shows live counts (pending / running / waiting
// / retrying / completed / failed), the Generation Speed setting, Stop/Resume,
// and per-task manual retry for tasks that failed after all auto-retries.
import { Play, Pause, RotateCcw, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useAiQueue,
  setGenerationSpeed,
  stopQueue,
  resumeQueue,
  retryTask,
  clearFinished,
  type GenerationSpeed,
  type QueueTaskStatus,
} from "@/lib/ai-queue";

const SPEEDS: { value: GenerationSpeed; label: string; hint: string }[] = [
  { value: "safe", label: "Safe Mode", hint: "1 request at a time" },
  { value: "balanced", label: "Balanced", hint: "2 requests at a time" },
  { value: "fast", label: "Fast", hint: "3 requests at a time" },
];

const STATUS_LABEL: Record<QueueTaskStatus, string> = {
  pending: "Pending",
  running: "Running",
  waiting: "Waiting",
  retrying: "Retrying",
  completed: "Completed",
  failed: "Failed",
};

const STATUS_CLS: Record<QueueTaskStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-blue-600",
  waiting: "text-amber-600",
  retrying: "text-amber-600",
  completed: "text-green-600",
  failed: "text-red-600",
};

export function QueuePanel() {
  const q = useAiQueue();
  const active = q.tasks.filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  );
  const failed = q.tasks.filter((t) => t.status === "failed");

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          <div className="text-sm font-medium">AI Request Queue</div>
        </div>
        <div className="flex gap-1">
          {q.paused ? (
            <Button size="sm" variant="outline" onClick={resumeQueue}>
              <Play className="mr-1 h-4 w-4" /> Resume Queue
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={stopQueue}>
              <Pause className="mr-1 h-4 w-4" /> Stop Queue
            </Button>
          )}
        </div>
      </div>

      {q.paused && (
        <div className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          Queue stopped — running tasks finish, no new requests start until you resume.
        </div>
      )}

      <div className="mt-3">
        <div className="text-xs font-medium text-muted-foreground">Generation Speed</div>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              onClick={() => setGenerationSpeed(s.value)}
              className={`rounded-md border px-2 py-2 text-left text-xs transition ${
                q.speed === s.value
                  ? "border-primary bg-primary/10"
                  : "border-input bg-background hover:bg-muted"
              }`}
            >
              <div className="font-medium">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
        {(Object.keys(STATUS_LABEL) as QueueTaskStatus[]).map((k) => (
          <div key={k} className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-center">
            <div className={`text-sm font-semibold ${STATUS_CLS[k]}`}>{q.counts[k]}</div>
            <div className="text-[11px] text-muted-foreground">{STATUS_LABEL[k]}</div>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <div className="mt-3 space-y-1">
          {active.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{t.label}</span>
              <span className={STATUS_CLS[t.status]}>
                {t.message ?? STATUS_LABEL[t.status]}
                {t.attempt > 0 ? ` (retry ${t.attempt})` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="mt-3 space-y-1">
          {failed.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-red-600">{t.label}: {t.error}</span>
              <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => retryTask(t.id)}>
                <RotateCcw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </div>
          ))}
        </div>
      )}

      {(active.length > 0 || failed.length > 0) && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearFinished}>
            Clear finished
          </Button>
        </div>
      )}
    </div>
  );
}
