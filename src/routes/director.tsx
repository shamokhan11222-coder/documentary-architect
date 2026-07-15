import { createFileRoute } from "@tanstack/react-router";
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  Film,
  Sparkles,
  Wand2,
  ThumbsUp,
  ThumbsDown,
  Lock,
  SkipForward,
  Music as MusicIcon,
  Volume2,
  Captions as CaptionsIcon,
  Sliders,
  Download,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useDirectorOrchestrator } from "@/lib/director/orchestrator";
import {
  STAGES,
  type DirectorProject,
  type Mode,
  type StageId,
  type StageStatus,
} from "@/lib/director/types";
import { CAPTION_PRESETS } from "@/lib/director/captions";
import { MUSIC_MOODS } from "@/lib/director/music";
import { SFX_LIBRARY } from "@/lib/director/sfx";
import { RESOLUTIONS, exportSummary } from "@/lib/director/export";

export const Route = createFileRoute("/director")({
  head: () => ({
    meta: [
      { title: "AI Director — Stickmax Studio" },
      { name: "description", content: "One brain that orchestrates research, story, voice, images, motion, captions, music, SFX, thumbnail, SEO and export — with checkpoints, approvals and auto-repair." },
    ],
  }),
  component: DirectorPage,
});

function DirectorPage() {
  const { selected, selectedId } = useSelectedProject();
  const api = useDirectorOrchestrator(selectedId, selected?.topic, selected?.explanation);
  const project = api.project;

  if (!selectedId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ProjectPicker />
        <p className="mt-6 text-sm text-muted-foreground">Select a project to open the AI Director.</p>
      </div>
    );
  }

  if (!project) return <div className="p-6 text-sm text-muted-foreground">Loading director…</div>;

  const overallProgress =
    Object.values(project.stages).reduce((sum, s) => sum + s.progress, 0) / STAGES.length;

  const currentStage = STAGES.find((s) => project.stages[s.id].status === "running")
    ?? STAGES.find((s) => project.stages[s.id].status !== "done" && project.stages[s.id].status !== "skipped");

  const queued = STAGES.filter((s) => project.stages[s.id].status === "pending").length;
  const doneCount = STAGES.filter((s) => project.stages[s.id].status === "done" || project.stages[s.id].status === "skipped").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Film className="h-6 w-6 text-primary" />
            AI Director
          </h1>
          <p className="text-sm text-muted-foreground">
            The brain of the whole pipeline — orchestrates every module, respects locks, resumes failures, never repeats finished work.
          </p>
        </div>
        <ProjectPicker />
      </header>

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <ModeSelector mode={project.mode} onChange={api.setMode} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={api.start} disabled={api.running}>
              {api.running ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              🎬 Direct My Video
            </Button>
            <Button size="lg" variant="outline" onClick={api.pause} disabled={!api.running}>
              <Pause className="mr-2 h-4 w-4" /> Pause
            </Button>
            <Button size="lg" variant="ghost" onClick={api.reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Current Stage" value={currentStage?.label ?? "Idle"} />
          <Kpi label="Overall Progress" value={`${Math.round(overallProgress * 100)}%`} />
          <Kpi label="Queued Stages" value={String(queued)} />
          <Kpi label="Completed" value={`${doneCount}/${STAGES.length}`} />
        </div>

        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(overallProgress * 100)}%` }} />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Live Timeline
          </h2>
          <ol className="space-y-2">
            {STAGES.map((s) => (
              <StageRow
                key={s.id}
                stage={project.stages[s.id]}
                onApprove={(v) => api.approveStage(s.id, v)}
                onReset={() => api.resetStage(s.id)}
              />
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          <WarningsCard warnings={api.warnings} suggestions={api.suggestions} />
          <MemoryCard project={project} onToggleLock={api.toggleLock} />
          <MotionCard project={project} />
          <CaptionsCard project={project} onChange={api.setCaptionPreset} />
          <MusicCard project={project} />
          <SfxCard project={project} />
          <ExportCard project={project} onChange={api.setExport} />
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <Wand2 className="h-4 w-4 text-primary" /> Checkpoint + Repair
        </h2>
        <p className="text-sm text-muted-foreground">
          Every stage saves as it finishes. Refresh, close the tab, or come back tomorrow — pressing <strong>Direct My Video</strong> resumes from the first unfinished stage.
          Image failures auto-fall back to the next provider. Voice failures skip the broken block and keep going. Voice-sync gaps are auto-repaired.
          A story rewrite only regenerates the affected scenes (scene-level cache), never the whole project.
        </p>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const modes: Array<{ id: Mode; label: string; desc: string }> = [
    { id: "guided", label: "Guided", desc: "Stops after every stage" },
    { id: "auto", label: "Auto", desc: "Runs continuously" },
    { id: "professional", label: "Professional", desc: "Full pipeline, checkpoint aware" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
            mode === m.id
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          <div className="font-medium">{m.label}</div>
          <div className="text-xs opacity-80">{m.desc}</div>
        </button>
      ))}
    </div>
  );
}

function StageRow({
  stage,
  onApprove,
  onReset,
}: {
  stage: DirectorProject["stages"][StageId];
  onApprove: (approved: boolean) => void;
  onReset: () => void;
}) {
  const pct = Math.round(stage.progress * 100);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <StatusIcon status={stage.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{stage.label}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {stage.status === "done" && stage.approved === true && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">✓ Approved</span>
            )}
            {stage.status === "done" && stage.approved === false && (
              <span className="rounded-md bg-yellow-500/10 px-1.5 py-0.5 text-yellow-500">⚠ Needs Review</span>
            )}
            <span>
              {stage.status === "done" && "100%"}
              {stage.status === "running" && stage.total ? `${stage.current ?? 0}/${stage.total}` : null}
              {stage.status === "running" && !stage.total ? `${pct}%` : null}
              {stage.status === "waiting" && (stage.waitingFor ? `Waiting for ${stage.waitingFor}` : "Waiting")}
              {stage.status === "pending" && "Ready"}
              {stage.status === "failed" && "Failed"}
              {stage.status === "skipped" && "Skipped"}
              {stage.stalled && stage.status === "running" && " · Stalled"}
            </span>
          </div>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
          <div
            className={`h-full transition-all ${
              stage.status === "failed" ? "bg-destructive" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {stage.error && <div className="mt-1 text-xs text-destructive">{stage.error}</div>}
        {stage.warnings?.map((w) => (
          <div key={w} className="mt-1 flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-3 w-3" /> {w}
          </div>
        ))}
        {stage.status === "done" && (
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => onApprove(true)}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                stage.approved === true ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <ThumbsUp className="h-3 w-3" /> Approve
            </button>
            <button
              onClick={() => onApprove(false)}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                stage.approved === false ? "border-yellow-500 bg-yellow-500/10 text-yellow-600" : "border-border text-muted-foreground hover:border-yellow-500/40"
              }`}
            >
              <ThumbsDown className="h-3 w-3" /> Needs Review
            </button>
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40"
              title="Regenerate this stage on the next run"
            >
              <RotateCcw className="h-3 w-3" /> Regenerate
            </button>
          </div>
        )}
        {stage.status === "failed" && (
          <button
            onClick={onReset}
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40"
          >
            <SkipForward className="h-3 w-3" /> Retry on next run
          </button>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (status === "running") return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  if (status === "failed") return <AlertTriangle className="h-5 w-5 text-destructive" />;
  if (status === "skipped") return <SkipForward className="h-5 w-5 text-muted-foreground" />;
  return <Circle className="h-5 w-5 text-muted-foreground" />;
}

function WarningsCard({ warnings, suggestions }: { warnings: string[]; suggestions: string[] }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Info className="h-4 w-4 text-primary" /> Warnings & Suggestions
      </h3>
      {warnings.length === 0 && suggestions.length === 0 ? (
        <p className="text-xs text-muted-foreground">All clear. No warnings, nothing outstanding.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {warnings.map((w) => (
            <li key={`w:${w}`} className="flex items-start gap-1 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
            </li>
          ))}
          {suggestions.map((s) => (
            <li key={`s:${s}`} className="flex items-start gap-1 text-muted-foreground">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> {s}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MemoryCard({
  project,
  onToggleLock,
}: {
  project: DirectorProject;
  onToggleLock: (kind: "character") => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4" /> Director Memory
      </h3>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Locked artifacts are never regenerated. Timeline, voice blocks and scene images are auto-remembered.
      </p>
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        <Chip active label={`${Object.keys(project.motionPresets).length} motion presets`} />
        <Chip active label={`${Object.keys(project.sfxCues).length} SFX cues`} />
        <Chip active label={`${project.locks.scenes.length} scene locks`} />
        <Chip active label={`${project.locks.prompts.length} prompt locks`} />
        <Chip active={project.locks.character} label="Character lock" onClick={() => onToggleLock("character")} />
        <Chip active label={`${project.locks.backgrounds.length} bg locks`} />
      </div>
    </Card>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick?: () => void }) {
  const cls = active
    ? "border-primary bg-primary/10 text-foreground"
    : "border-border text-muted-foreground";
  return onClick ? (
    <button onClick={onClick} className={`rounded-md border px-2 py-1 text-left ${cls}`}>{label}</button>
  ) : (
    <span className={`rounded-md border px-2 py-1 ${cls}`}>{label}</span>
  );
}

function MotionCard({ project }: { project: DirectorProject }) {
  const entries = Object.entries(project.motionPresets);
  const counts = entries.reduce<Record<string, number>>((acc, [, p]) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sliders className="h-4 w-4" /> Camera Motion
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Auto-picked per scene: zoom, pan, tilt, Ken Burns, camera travel, focus shift.</p>
      ) : (
        <div className="space-y-1 text-xs">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="capitalize">{k.replace("-", " ")}</span>
              <span className="text-muted-foreground">{v} scenes</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CaptionsCard({
  project,
  onChange,
}: {
  project: DirectorProject;
  onChange: (id: DirectorProject["captionPreset"]) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CaptionsIcon className="h-4 w-4" /> Subtitle / Captions
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {CAPTION_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`rounded-md border px-2 py-1 text-xs ${
              project.captionPreset === p.id
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Word-level cue timing derived from narration.</p>
    </Card>
  );
}

function MusicCard({ project }: { project: DirectorProject }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <MusicIcon className="h-4 w-4" /> Music Suggestion
      </h3>
      <div className="flex flex-wrap gap-1">
        {MUSIC_MOODS.map((m) => (
          <span
            key={m}
            className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
              project.musicMood === m
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {m}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Auto-ducks under narration to -18 dB.</p>
    </Card>
  );
}

function SfxCard({ project }: { project: DirectorProject }) {
  const used = new Set<string>();
  Object.values(project.sfxCues).forEach((arr) => arr.forEach((x) => used.add(x)));
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Volume2 className="h-4 w-4" /> SFX Suggestion
      </h3>
      <div className="flex flex-wrap gap-1">
        {SFX_LIBRARY.map((s) => (
          <span
            key={s}
            className={`rounded-md border px-2 py-0.5 text-[11px] capitalize ${
              used.has(s)
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {s}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Scene-aware detection across the script.</p>
    </Card>
  );
}

function ExportCard({
  project,
  onChange,
}: {
  project: DirectorProject;
  onChange: (cfg: DirectorProject["export"]) => void;
}) {
  const summary = exportSummary(project.export);
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Download className="h-4 w-4" /> Export Queue
      </h3>
      <div className="mb-2 flex gap-1">
        {(Object.keys(RESOLUTIONS) as Array<keyof typeof RESOLUTIONS>).map((r) => (
          <button
            key={r}
            onClick={() => onChange({ ...project.export, resolution: r })}
            className={`flex-1 rounded-md border px-2 py-1 text-xs ${
              project.export.resolution === r
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-1">
        {[30, 60].map((f) => (
          <button
            key={f}
            onClick={() => onChange({ ...project.export, fps: f as 30 | 60 })}
            className={`flex-1 rounded-md border px-2 py-1 text-xs ${
              project.export.fps === f
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            {f} fps
          </button>
        ))}
      </div>
      <dl className="space-y-1 text-[11px] text-muted-foreground">
        <div className="flex justify-between"><dt>Dimensions</dt><dd>{summary.dimensions}</dd></div>
        <div className="flex justify-between"><dt>Codec</dt><dd>{summary.codec}</dd></div>
        <div className="flex justify-between"><dt>Bitrate</dt><dd>{summary.bitrateKbps} kbps</dd></div>
      </dl>
    </Card>
  );
}