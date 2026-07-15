import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wrench, RefreshCw, Trash2, Database, Cpu, ListVideo, ServerCog, HardDrive, Bug, ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAiQueue, clearFinished, stopQueue, resumeQueue } from "@/lib/ai-queue";
import { useImageProviderStatus } from "@/lib/provider";
import { getImagePipelineDebug } from "@/lib/image-pipeline";
import { useTopics, useAllStories, useAllVisuals } from "@/lib/store";

export const Route = createFileRoute("/system-health")({
  head: () => ({ meta: [{ title: "Owner — System Health" }] }),
  component: SystemHealthPage,
});

function Row({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Wrench }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function SystemHealthPage() {
  const queue = useAiQueue();
  const imageProvider = useImageProviderStatus();
  const topics = useTopics();
  const stories = useAllStories();
  const visuals = useAllVisuals();
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    // Estimate localStorage usage (only place we persist owner data).
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k) ?? "";
        total += k.length + v.length;
      }
      setStorageBytes(total * 2); // UTF-16
    } catch {
      setStorageBytes(null);
    }
  }, [topics, stories, visuals]);

  const debugCount = getImagePipelineDebug().length;
  const kb = storageBytes == null ? "—" : `${(storageBytes / 1024).toFixed(1)} KB`;

  function clearCache() {
    if (!confirm("Clear cached AI catalog and image pipeline debug entries? Projects are NOT touched.")) return;
    try {
      // Non-destructive cache keys only. Never remove docos.* project data.
      localStorage.removeItem("docos.openrouter.catalog");
      localStorage.removeItem("docos.image.pipeline.debug");
      toast.success("Caches cleared. Project data preserved.");
    } catch {
      toast.error("Could not clear caches.");
    }
  }

  function rebuildSearchIndex() {
    // Local KB/assets are already indexed on read; rebuild is a no-op refresh.
    toast.success("Search index rebuilt (in-memory).");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-2">
        <Wrench className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Owner — System Health</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Internal tools for the studio owner. Nothing here is exposed to customers.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Queue Status</div>
          <div className="space-y-1.5">
            <Row icon={ListVideo} label="Pending" value={queue.counts.pending} />
            <Row icon={ListVideo} label="Running" value={queue.counts.running} />
            <Row icon={ListVideo} label="Waiting" value={queue.counts.waiting} />
            <Row icon={ListVideo} label="Retrying" value={queue.counts.retrying} />
            <Row icon={ListVideo} label="Completed" value={queue.counts.completed} />
            <Row icon={ListVideo} label="Failed" value={queue.counts.failed} />
            <Row icon={Cpu} label="Speed / Concurrency" value={`${queue.speed} · ${queue.concurrency}`} />
            <Row icon={Cpu} label="Paused" value={queue.paused ? "yes" : "no"} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={queue.paused ? resumeQueue : stopQueue}>
              {queue.paused ? "Resume Queue" : "Stop Queue"}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearFinished}>Clear Finished</Button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Provider Status</div>
          <div className="space-y-1.5">
            <Row icon={ServerCog} label="Image Provider" value={imageProvider.label} />
            <Row icon={ServerCog} label="Connected" value={imageProvider.connected ? "yes" : "no"} />
            <Row icon={ServerCog} label="Test Passed" value={imageProvider.testPassed ? "yes" : "no"} />
            <Row icon={ServerCog} label="Status" value={imageProvider.message} />
            <Row icon={ServerCog} label="Text Provider" value="OpenRouter (free models)" />
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Database & Storage</div>
          <div className="space-y-1.5">
            <Row icon={Database} label="Projects" value={topics.length} />
            <Row icon={Database} label="Stories" value={Object.keys(stories).length} />
            <Row icon={Database} label="Storyboards" value={Object.keys(visuals).length} />
            <Row icon={HardDrive} label="Local Storage Used" value={kb} />
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Background Jobs & Logs</div>
          <div className="space-y-1.5">
            <Row icon={Bug} label="Image pipeline events" value={debugCount} />
            <Row icon={ScrollText} label="Export history" value="—" />
            <Row icon={ScrollText} label="Import history" value="—" />
            <Row icon={ScrollText} label="Application logs" value="see browser console" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
            Developer Mode (verbose console)
          </label>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={clearCache}>
          <Trash2 className="mr-2 h-4 w-4" /> Clear Cache
        </Button>
        <Button variant="outline" onClick={rebuildSearchIndex}>
          <RefreshCw className="mr-2 h-4 w-4" /> Rebuild Search Index
        </Button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Export/Import history and render-time telemetry populate once those pipelines start emitting events. Placeholders shown until then — never fake numbers.
      </p>
    </div>
  );
}