import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  Music as MusicIcon,
  Volume2,
  Captions as CaptionsIcon,
  Sliders,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useStory } from "@/lib/store";
import { DirectorEngine } from "@/lib/director/engine";
import {
  loadProject,
  newProject,
  saveProject,
} from "@/lib/director/checkpoint";
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
      { name: "description", content: "Direct your entire video pipeline with checkpoints, motion, captions, music, SFX and export." },
    ],
  }),
  component: DirectorPage,
});

function DirectorPage() {
  const projectId = useSelectedProject();
  const story = useStory(projectId);

  const scenes = useMemo(() => {
    if (!story) return [];
    if (story.sections && story.sections.length) {
      return story.sections.map((s, i) => ({
        id: `${projectId}:${s.key || i}`,
        text: `${s.title}. ${s.content}`,
      }));
    }
    // Fallback: split script into ~120-word scenes.
    const words = story.script.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 120) {
      chunks.push(words.slice(i, i + 120).join(" "));
    }
    return chunks.map((text, i) => ({ id: `${projectId}:${i}`, text }));
  }, [story, projectId]);

  const [project, setProject] = useState<DirectorProject | null>(null);
  const engineRef = useRef<DirectorEngine | null>(null);

  useEffect(() => {
    if (!projectId) { setProject(null); return; }
    const existing = loadProject(projectId);
    setProject(existing ?? newProject(projectId, "auto"));
  }, [projectId]);

  // Keep engine context in sync when scenes/project change
  useEffect(() => {
    if (!project) return;
    engineRef.current?.updateContext({ project, scenes, setProject });
  }, [scenes, project]);

  const setMode = (mode: Mode) => {
    if (!project) return;
    const next = { ...project, mode };
    saveProject(next);
    setProject(next);
  };

  const start = async () => {
    if (!project || !projectId) return;
    if (!scenes.length) {
      toast.error("This project has no story yet. Generate a story first.");
      return;
    }
    const engine = new DirectorEngine(
      { project, scenes, setProject },
      {
        onStageStart: (id) => toast(`Starting ${labelFor(id)}…`),
        onStageDone: (id) => toast.success(`${labelFor(id)} complete`),
        onStageError: (id, err) => toast.error(`${labelFor(id)} failed: ${err.message}`),
      },
    );
    engineRef.current = engine;
    await engine.run();
  };

  const pause = () => engineRef.current?.pause();

  const resetAll = () => {
    if (!project) return;
    const fresh = newProject(project.projectId, project.mode);
    saveProject(fresh);
    setProject(fresh);
  };

  if (!projectId) {
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

  const canResume = Object.values(project.stages).some((s) => s.status === "done" || s.status === "waiting" || s.status === "failed");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Film className="h-6 w-6 text-primary" />
            AI Director
          </h1>
          <p className="text-sm text-muted-foreground">
            One button. Full pipeline. Checkpoints, motion, captions, music, SFX and render.
          </p>
        </div>
        <ProjectPicker />
      </header>

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <ModeSelector mode={project.mode} onChange={setMode} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={start} disabled={engineRef.current?.isRunning}>
              <Play className="mr-2 h-5 w-5" /> 🎬 Direct My Video
            </Button>
            <Button size="lg" variant="outline" onClick={pause}>
              <Pause className="mr-2 h-4 w-4" /> Pause
            </Button>
            {canResume && (
              <Button size="lg" variant="ghost" onClick={resetAll} title="Wipe checkpoints and start over">
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Pipeline progress</span>
            <span>{Math.round(overallProgress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round(overallProgress * 100)}%` }}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Live Progress
          </h2>
          <ol className="space-y-2">
            {STAGES.map((s) => (
              <StageRow key={s.id} stage={project.stages[s.id]} />
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          <MotionCard project={project} />
          <CaptionsCard project={project} setProject={(p) => { saveProject(p); setProject(p); }} />
          <MusicCard project={project} />
          <SfxCard project={project} />
          <ExportCard project={project} setProject={(p) => { saveProject(p); setProject(p); }} scenesCount={scenes.length} />
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <Wand2 className="h-4 w-4 text-primary" /> Checkpoint System
        </h2>
        <p className="text-sm text-muted-foreground">
          Every stage saves to <code>localStorage</code> the moment it finishes. Close the tab, refresh, or come back tomorrow —
          hitting <strong>Direct My Video</strong> resumes from the next unfinished stage and never re-runs completed work. Failed
          stages keep their error and can be retried without touching earlier scenes.
        </p>
      </Card>
    </div>
  );
}

function labelFor(id: StageId) {
  return STAGES.find((s) => s.id === id)?.label ?? id;
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

function StageRow({ stage }: { stage: DirectorProject["stages"][StageId] }) {
  const pct = Math.round(stage.progress * 100);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <StatusIcon status={stage.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{stage.label}</span>
          <span className="text-xs text-muted-foreground">
            {stage.status === "done" && "100%"}
            {stage.status === "running" && stage.total ? `${stage.current}/${stage.total}` : null}
            {stage.status === "running" && !stage.total ? `${pct}%` : null}
            {stage.status === "waiting" && "Waiting"}
            {stage.status === "pending" && "Pending"}
            {stage.status === "failed" && "Failed"}
          </span>
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
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (status === "running") return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  if (status === "failed") return <AlertTriangle className="h-5 w-5 text-destructive" />;
  return <Circle className="h-5 w-5 text-muted-foreground" />;
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
        <Sliders className="h-4 w-4" /> Motion Engine
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Runs on every image: zoom, pan, tilt, Ken Burns, camera travel, focus shift.
        </p>
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

function CaptionsCard({ project, setProject }: { project: DirectorProject; setProject: (p: DirectorProject) => void }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CaptionsIcon className="h-4 w-4" /> Captions
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {CAPTION_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProject({ ...project, captionPreset: p.id })}
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
      <p className="mt-2 text-[11px] text-muted-foreground">Animated captions with word highlighting.</p>
    </Card>
  );
}

function MusicCard({ project }: { project: DirectorProject }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <MusicIcon className="h-4 w-4" /> Music
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
        <Volume2 className="h-4 w-4" /> SFX
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
      <p className="mt-2 text-[11px] text-muted-foreground">Scene-aware detection — wind, water, birds, roar, explosion, footsteps, rain.</p>
    </Card>
  );
}

function ExportCard({
  project,
  setProject,
  scenesCount,
}: {
  project: DirectorProject;
  setProject: (p: DirectorProject) => void;
  scenesCount: number;
}) {
  const summary = exportSummary(project.export);
  const estSec = Math.max(30, scenesCount * 6);
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Download className="h-4 w-4" /> Export
      </h3>
      <div className="mb-2 flex gap-1">
        {(Object.keys(RESOLUTIONS) as Array<keyof typeof RESOLUTIONS>).map((r) => (
          <button
            key={r}
            onClick={() => setProject({ ...project, export: { ...project.export, resolution: r } })}
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
            onClick={() => setProject({ ...project, export: { ...project.export, fps: f as 30 | 60 } })}
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
        <div className="flex justify-between"><dt>Est. duration</dt><dd>{estSec}s</dd></div>
      </dl>
    </Card>
  );
}