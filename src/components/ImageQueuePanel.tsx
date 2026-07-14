// Live image-generation queue panel: provider status, test images, controls.
// Active pipeline: Lovable AI Gateway (primary — billed via workspace credits).
// Pollinations / Puter remain as disabled legacy providers behind test buttons.
import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, SkipForward, Square, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useImageQueue,
  pauseImageQueue,
  resumeImageQueue,
  retryFailedImages,
  continueFromLastImage,
  stopAfterCurrentImage,
  setQueueDelay,
  DELAY_OPTIONS,
} from "@/lib/image-queue";
import { usePuterStatus } from "@/lib/puter-image";
import { usePollinationsStatus } from "@/lib/pollinations-image";
import { generateTestImage, type ImageSanityResult } from "@/lib/generate-image";
import { useLovableGatewayStatus, useLovableGatewayModel } from "@/lib/lovable-gateway-image";
import { buildDebugReport } from "@/lib/image-pipeline";

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
  const puter = usePuterStatus();
  const pollinations = usePollinationsStatus();
  useNow(q.state === "cooling" || q.state === "running");

  const [testing, setTesting] = useState<null | "puter" | "pollinations" | "lovable-gateway">(null);
  const [testImg, setTestImg] = useState<string | null>(null);
  const [testInfo, setTestInfo] = useState<string | null>(null);
  const [testedOk, setTestedOk] = useState(false);
  const gatewayStatus = useLovableGatewayStatus();
  const gatewayModel = useLovableGatewayModel();

  const running = q.state === "running" || q.state === "cooling";

  async function runTest(only: "puter" | "pollinations" | "lovable-gateway") {
    setTesting(only);
    setTestInfo(null);
    try {
      const r: ImageSanityResult = await generateTestImage(only);
      if (r.ok && r.image) {
        setTestImg(r.image);
        setTestInfo(`${r.provider} · ${r.model} · ${r.ms}ms`);
        setTestedOk(true);
        toast.success(`${only} test image generated.`);
      } else {
        setTestInfo(r.error ?? "Test failed.");
        toast.error(r.error ?? "Test failed.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestInfo(msg);
      toast.error(msg);
    } finally {
      setTesting(null);
    }
  }

  function copyDebug() {
    const report = buildDebugReport() || "No image requests recorded yet.";
    navigator.clipboard?.writeText(report).then(
      () => toast.success("Debug report copied."),
      () => toast.error("Could not copy debug report."),
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Image Queue · Lovable AI Gateway ({gatewayModel})</div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={onStart} disabled={running || !testedOk}>
            <Play className="mr-1 h-4 w-4" /> Start Queue
          </Button>
          {running ? (
            <Button size="sm" variant="outline" onClick={pauseImageQueue}>
              <Pause className="mr-1 h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={resumeImageQueue} disabled={q.state !== "paused"}>
              <Play className="mr-1 h-4 w-4" /> Resume
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={stopAfterCurrentImage} disabled={!running}>
            <Square className="mr-1 h-4 w-4" /> Stop After Current
          </Button>
          <Button size="sm" variant="outline" onClick={retryFailedImages} disabled={q.failed === 0}>
            <RotateCcw className="mr-1 h-4 w-4" /> Retry Failed
          </Button>
          <Button size="sm" variant="outline" onClick={continueFromLastImage}>
            <SkipForward className="mr-1 h-4 w-4" /> Continue From Last
          </Button>
        </div>
      </div>

      {/* Provider status + sanity test */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat label="Lovable Gateway (primary)" value={gatewayStatus} />
        <Stat label="Puter AI (legacy)" value={puter} />
        <Stat label="Pollinations (legacy)" value={pollinations} />
      </div>

      {!testedOk && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Generate at least one test image below before the full queue unlocks.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => runTest("lovable-gateway")} disabled={testing !== null}>
          {testing === "lovable-gateway" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
          Generate 1 Gateway Test Image
        </Button>
        <Button size="sm" variant="outline" onClick={() => runTest("puter")} disabled={testing !== null}>
          {testing === "puter" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
          Legacy: Puter Test
        </Button>
        <Button size="sm" variant="outline" onClick={() => runTest("pollinations")} disabled={testing !== null}>
          {testing === "pollinations" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
          Legacy: Pollinations Test
        </Button>
        <Button size="sm" variant="ghost" onClick={copyDebug}>
          Copy Debug Report
        </Button>
      </div>

      {testImg && (
        <div className="mt-3 flex items-center gap-3">
          <img src={testImg} alt="Test" className="h-24 w-24 rounded-md border border-border object-cover" />
          <div className="text-xs text-muted-foreground">{testInfo}</div>
        </div>
      )}
      {!testImg && testInfo && (
        <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{testInfo}</div>
      )}

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
        <Stat label="Provider" value={q.activeKeyName ?? "—"} />
        <Stat label="Model" value={q.activeModel ?? "—"} />
        <Stat label="Completed" value={String(q.completed)} cls="text-green-600" />
        <Stat label="Pending" value={String(q.pending)} />
        <Stat label="Failed" value={String(q.failed)} cls={q.failed ? "text-red-600" : undefined} />
        <Stat label="Total" value={String(q.total)} />
        <Stat label="State" value={q.state} />
      </div>

      {q.message && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{q.message}</div>
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
