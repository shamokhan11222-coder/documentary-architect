import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Play,
  RotateCw,
  Users,
  XCircle,
  Circle,
  Clock,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSelectedProject } from "@/components/ProjectPicker";
import { ProjectHeader } from "@/components/ProjectHeader";
import { hasUnlimitedAccess } from "@/lib/account";
import { PIPELINE, stageDone, completionPercent, prereqsMet, type StageKey } from "@/lib/manager";
import {
  usePipeline,
  getPipeline,
  patchStage,
  logActivity,
  setRunning,
  setTask,
  etaRemainingMs,
  fmtDuration,
  type TaskStatus,
} from "@/lib/pipeline";
import { getStyleProfile } from "@/lib/preferences";
import {
  researchTopic,
  generateStory,
  generateVisualMap,
  generateThumbnails,
  generateSeo,
  rateVideo,
} from "@/lib/ai.functions";
import { generateSceneImage, generateThumbnailImage } from "@/lib/generate-image";
import { putImage } from "@/lib/images";
import { generateVoiceBlock } from "@/lib/generate-voice";
import {
  DEFAULT_VOICE_SETTINGS,
  scriptToParagraphs,
  estimateSeconds,
} from "@/lib/production";
import {
  saveResearch,
  saveStory,
  saveVisualMap,
  saveThumbnails,
  saveSeo,
  saveRating,
  useProjectStatus,
} from "@/lib/store";
import type {
  Research,
  Story,
  ThumbnailIdea,
  VisualScene,
  VoiceBlock,
  VoiceProject,
} from "@/lib/types";

export const Route = createFileRoute("/manager")({
  head: () => ({ meta: [{ title: "Production Dashboard — Stickmax Studio" }] }),
  component: ManagerPage,
});

function readLS<T>(key: string, id: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as Record<string, T>)[id] ?? null;
  } catch {
    return null;
  }
}

function ManagerPage() {
  const { topics, selected, selectedId } = useSelectedProject();
  const status = useProjectStatus(selectedId);
  void status;
  const pipeline = usePipeline(selectedId);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  // Automatic retry with exponential backoff for transient AI outages.
  const RETRY_BACKOFFS_MS = [10000, 30000, 60000];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function isTransient(msg: string): boolean {
    return /unavailable|temporarily|overloaded|timeout|timed out|try again|\b(429|502|503|504)\b|rate.?limit/i.test(
      msg,
    );
  }
  // Run an AI call, retrying on transient failures (10s → 30s → 60s). After the
  // final attempt the error propagates so ONLY this stage is marked failed —
  // earlier completed stages (Research, Story) stay saved.
  async function withRetry<T>(id: string, stage: StageKey, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isTransient(msg) || attempt >= RETRY_BACKOFFS_MS.length) throw e;
        const wait = RETRY_BACKOFFS_MS[attempt];
        patchStage(id, stage, { status: "retry" });
        setTask(id, stage, `Waiting before retry… (${wait / 1000}s)`);
        logActivity(id, `${stage} paused — AI briefly unavailable, retrying in ${wait / 1000}s`, "info");
        await sleep(wait);
        if (cancelled.current) throw new Error("Stopped");
        patchStage(id, stage, { status: "running" });
      }
    }
  }

  const doResearch = useServerFn(researchTopic);
  const doStory = useServerFn(generateStory);
  const doVisual = useServerFn(generateVisualMap);
  const doThumbs = useServerFn(generateThumbnails);
  const doSeo = useServerFn(generateSeo);
  const doRate = useServerFn(rateVideo);

  // Run a single stage. Returns true on success, false on failure.
  async function runStage(id: string, topic: string, explanation: string, stage: StageKey): Promise<boolean> {
    // Locking: never run a stage before its prerequisites are completed.
    if (!prereqsMet(id, stage)) {
      patchStage(id, stage, { status: "failed", error: "Complete the previous stage first." });
      logActivity(id, `${stage} locked — complete the previous stage first`, "error");
      toast.error("Complete the previous stage first.");
      return false;
    }
    patchStage(id, stage, { status: "running", startedAt: Date.now(), error: undefined });
    setTask(id, stage, `${PIPELINE.find((p) => p.key === stage)?.expert} working…`);
    try {
      if (stage === "research") {
        setTask(id, stage, "Research Expert → gathering facts…");
        const r = (await doResearch({ data: { topic, explanation } })) as Omit<Research, "topicId" | "generatedAt">;
        saveResearch({ ...r, topicId: id, generatedAt: Date.now() });
      } else if (stage === "story") {
        const research = readLS<Research>("docos.research", id);
        setTask(id, stage, "Story Architect → writing script…");
        const s = (await doStory({ data: { topic, research: research ?? undefined } })) as Omit<Story, "topicId" | "generatedAt">;
        saveStory({ ...s, topicId: id, generatedAt: Date.now() });
      } else if (stage === "storyboard") {
        const story = readLS<Story>("docos.story", id);
        if (!story) throw new Error("Story required before storyboard");
        setTask(id, stage, "Visual Director → building storyboard…");
        const scenes = (await withRetry(id, stage, () =>
          doVisual({ data: { topic, script: story.script } }),
        )) as VisualScene[];
        saveVisualMap({ topicId: id, scenes, generatedAt: Date.now() });
      } else if (stage === "images") {
        const visual = readLS<{ scenes: VisualScene[] }>("docos.visual", id);
        const scenes = visual?.scenes ?? [];
        if (!scenes.length) throw new Error("Storyboard required before images");
        for (let i = 0; i < scenes.length; i++) {
          if (cancelled.current) throw new Error("Stopped");
          setTask(id, stage, `Visual Director → image ${i + 1}/${scenes.length}…`);
          const url = await generateSceneImage(scenes[i]);
          await putImage(`scene:${id}:${scenes[i].sceneNumber}`, url);
        }
      } else if (stage === "thumbnail") {
        const story = readLS<Story>("docos.story", id);
        const research = readLS<Research>("docos.research", id);
        if (!story) throw new Error("Story required before thumbnails");
        setTask(id, stage, "Thumbnail Designer → designing…");
        const ideas = (await doThumbs({ data: { topic, script: story.script, angle: research?.storyAngles?.[0] } })) as ThumbnailIdea[];
        saveThumbnails({ topicId: id, ideas, generatedAt: Date.now() });
        for (let i = 0; i < ideas.length; i++) {
          if (cancelled.current) throw new Error("Stopped");
          setTask(id, stage, `Thumbnail Designer → rendering ${i + 1}/${ideas.length}…`);
          try {
            const url = await generateThumbnailImage(ideas[i]);
            await putImage(`thumb:${id}:${i}`, url);
          } catch {
            /* a single thumbnail render can be skipped */
          }
        }
      } else if (stage === "seo") {
        const story = readLS<Story>("docos.story", id);
        if (!story) throw new Error("Story required before SEO");
        setTask(id, stage, "SEO Specialist → metadata…");
        const seo = await doSeo({ data: { topic, script: story.script } });
        saveSeo({ ...seo, topicId: id, generatedAt: Date.now() });
      } else if (stage === "voice") {
        const story = readLS<Story>("docos.story", id);
        if (!story) throw new Error("Story required before voice");
        const existing = readLS<VoiceProject>("docos.voice", id);
        const settings = existing?.settings ?? DEFAULT_VOICE_SETTINGS;
        const paras = scriptToParagraphs(story.script);
        const blocks: VoiceBlock[] = paras.map((text, i) => ({ index: i, text, estSeconds: estimateSeconds(text) }));
        for (let i = 0; i < blocks.length; i++) {
          if (cancelled.current) throw new Error("Stopped");
          setTask(id, stage, `Voice Director → narrating ${i + 1}/${blocks.length}…`);
          try {
            blocks[i].realSeconds = await generateVoiceBlock(id, i, blocks[i].text, settings);
            blocks[i].generatedAt = Date.now();
          } catch {
            /* a single block can be regenerated later in Voice Studio */
          }
        }
        const voice: VoiceProject = { topicId: id, settings, blocks, generatedAt: Date.now() };
        localStorage.setItem(
          "docos.voice",
          JSON.stringify({ ...(JSON.parse(localStorage.getItem("docos.voice") || "{}")), [id]: voice }),
        );
        window.dispatchEvent(new Event("storage"));
      } else if (stage === "rating") {
        const story = readLS<Story>("docos.story", id);
        if (!story) throw new Error("Story required before rating");
        setTask(id, stage, "Quality Reviewer → scoring…");
        const rating = await doRate({ data: { topic, script: story.script } });
        saveRating({ ...rating, topicId: id, generatedAt: Date.now() });
      }
      patchStage(id, stage, { status: "completed", finishedAt: Date.now() });
      const label = PIPELINE.find((p) => p.key === stage)?.label ?? stage;
      logActivity(id, `${label} finished`, "success");
      toast.success(`${label} finished`);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      const isCredits =
        !hasUnlimitedAccess() && /CREDITS_EXHAUSTED|credits? (exhausted|finished)/i.test(msg);
      patchStage(id, stage, { status: "failed", error: msg, finishedAt: Date.now() });
      const label = PIPELINE.find((p) => p.key === stage)?.label ?? stage;
      if (isCredits) {
        cancelled.current = true;
        const note = "Credits exhausted. Your completed work is saved. Continue later.";
        patchStage(id, stage, { status: "failed", error: note, finishedAt: Date.now() });
        logActivity(id, note, "error");
        toast.error(note);
      } else {
        logActivity(id, `${label} failed: ${msg}`, "error");
        if (msg !== "Stopped") toast.error(`${label} failed: ${msg}`);
      }
      return false;
    }
  }

  // Run the whole pipeline from the first non-completed stage (smart resume),
  // pausing on the first failure so the user can retry that step.
  async function runPipeline(regen = false, fromStage?: StageKey) {
    if (!selected) return;
    const t = selected;
    cancelled.current = false;
    setBusy(true);
    setRunning(t.id, true);
    logActivity(t.id, "Production started", "info");
    try {
      let started = !fromStage;
      for (const s of PIPELINE) {
        if (cancelled.current) break;
        if (fromStage && s.key === fromStage) started = true;
        if (!started) continue;
        if (!regen && stageDone(t.id, s.key)) {
          patchStage(t.id, s.key, { status: "completed" });
          continue;
        }
        const ok = await runStage(t.id, t.topic, t.explanation, s.key);
        if (!ok) {
          logActivity(t.id, "Pipeline paused — fix the failed step and retry", "error");
          return;
        }
      }
      if (!cancelled.current) {
        logActivity(t.id, "Project complete", "success");
        toast.success("Project complete 🎬");
      }
    } finally {
      setRunning(getPipeline(t.id).topicId, false);
      setBusy(false);
    }
  }

  async function retryStage(stage: StageKey) {
    if (!selected) return;
    if (!prereqsMet(selected.id, stage)) {
      toast.error("Complete the previous stage first.");
      return;
    }
    cancelled.current = false;
    setBusy(true);
    setRunning(selected.id, true, stage);
    try {
      await runPipeline(false, stage);
    } finally {
      setBusy(false);
    }
  }

  // Recovery: run ONLY the given stage (does not continue to later stages).
  async function runSingleStage(stage: StageKey) {
    if (!selected) return;
    if (!prereqsMet(selected.id, stage)) {
      toast.error("Complete the previous stage first.");
      return;
    }
    cancelled.current = false;
    setBusy(true);
    setRunning(selected.id, true, stage);
    try {
      await runStage(selected.id, selected.topic, selected.explanation, stage);
    } finally {
      setRunning(selected.id, false);
      setBusy(false);
    }
  }

  // Recovery: clear a stage's failed/error marker so it returns to the queue,
  // without touching any completed earlier stages or their saved output.
  function resetStage(stage: StageKey) {
    if (!selected) return;
    patchStage(selected.id, stage, { status: "pending", error: undefined, finishedAt: undefined });
    logActivity(selected.id, `${stage} reset`, "info");
    toast.success("Stage reset.");
  }

  const pct = selectedId ? completionPercent(selectedId) : 0;
  const styleProfile = getStyleProfile();

  const counts = { completed: 0, pending: 0, failed: 0, running: 0 };
  if (pipeline) {
    for (const s of PIPELINE) {
      const st = pipeline.stages[s.key]?.status ?? "pending";
      counts[st] += 1;
    }
  }
  const failedStage = PIPELINE.find((s) => pipeline?.stages[s.key]?.status === "failed");
  const eta = pipeline ? etaRemainingMs(pipeline) : 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Production Dashboard</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        One click runs the full pipeline. Every specialist works in order, weak
        output pauses the run, and progress is saved so it always resumes where it stopped.
      </p>

      <div className="mt-5">
        <ProjectHeader topics={topics} selectedId={selectedId} />
      </div>

      {!selected ? (
        <p className="text-sm text-muted-foreground">Select a project to coordinate production.</p>
      ) : (
        <>
          {/* Overview */}
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Overall progress</div>
              <div className="text-xs text-muted-foreground">{pct}% complete</div>
            </div>
            <Progress value={pct} className="mt-2" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="Completed" value={counts.completed} tone="text-green-600" />
              <Stat label="Pending" value={counts.pending} tone="text-muted-foreground" />
              <Stat label="Failed" value={counts.failed} tone="text-red-600" />
              <Stat label="Est. remaining" value={busy ? fmtDuration(eta) : "—"} tone="text-foreground" />
            </div>
            {pipeline?.running && pipeline.currentTask && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{pipeline.currentTask}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => runPipeline(false)} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                Generate Project
              </Button>
              {busy && (
                <Button variant="outline" onClick={() => (cancelled.current = true)}>
                  Stop
                </Button>
              )}
              {failedStage && !busy && (
                <Button variant="secondary" onClick={() => retryStage(failedStage.key)}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Retry {failedStage.label}
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => runPipeline(true)}>
                <RotateCw className="mr-1 h-4 w-4" /> Regenerate all
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-medium">Production timeline</div>
            <div className="mt-3 space-y-1.5">
              {PIPELINE.map((s) => {
                const st: TaskStatus = pipeline?.stages[s.key]?.status ?? "pending";
                const err = pipeline?.stages[s.key]?.error;
                return (
                  <div
                    key={s.key}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                      st === "failed" ? "border-red-500/50" : st === "running" ? "border-primary" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <StageIcon status={st} />
                      <span className={st === "completed" ? "" : "text-muted-foreground"}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {st === "failed" && err && (
                        <span className="max-w-[160px] truncate text-[11px] text-red-600" title={err}>
                          {err}
                        </span>
                      )}
                      {st === "failed" && !busy ? (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => retryStage(s.key)}>
                          Retry
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {st === "completed" ? "done" : st === "running" ? "running" : s.expert}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final quality check */}
          <FinalQualityCheck topicId={selected.id} />

          {/* Recent activity */}
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-medium">Recent activity</div>
            {!pipeline?.activity.length ? (
              <p className="mt-1 text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {pipeline.activity.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span
                      className={
                        a.level === "error"
                          ? "text-red-600"
                          : a.level === "success"
                            ? "text-green-600"
                            : "text-muted-foreground"
                      }
                    >
                      {a.msg}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground/70">
                      {new Date(a.at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-medium">What the manager knows</div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {styleProfile || "No learned style yet. Use 👍 ❤️ 👎 across the studio to teach it."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className={`text-base font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StageIcon({ status }: { status: TaskStatus }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-600" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

function FinalQualityCheck({ topicId }: { topicId: string }) {
  const status = useProjectStatus(topicId);
  const rating = readLS<{ overallScore: number }>("docos.rating", topicId);
  const checks: { label: string; ok: boolean }[] = [
    { label: "Research", ok: status.research },
    { label: "Story", ok: status.story },
    { label: "Storyboard", ok: status.visual },
    { label: "Thumbnail", ok: status.thumbnail },
    { label: "SEO", ok: status.seo },
    { label: "Rating", ok: status.rating },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const overall = rating?.overallScore ?? 0;
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Final quality check</div>
        <div className="text-xs text-muted-foreground">
          {passed}/{checks.length} passed{overall ? ` · overall ${overall}/10` : ""}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {checks.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
              c.ok ? "border-green-600/40 text-green-600" : "border-amber-500/40 text-amber-600"
            }`}
          >
            {c.ok ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {c.label}: {c.ok ? "Passed" : "Needs Improvement"}
          </span>
        ))}
      </div>
    </div>
  );
}
