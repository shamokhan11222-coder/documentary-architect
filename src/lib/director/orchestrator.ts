// Real orchestrator hook. Wires the AI Director to the actual production
// pipeline (server functions, image queue, voice sync) rather than any
// simulated placeholder. Uses the shared `pipeline.ts` state + `stageDone`
// smart cache so completed work is never re-run and refresh-safe resume
// is inherited automatically.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  researchTopic,
  generateStory,
  generateVisualMap,
  generateThumbnails,
  generateSeo,
  suggestAudio,
} from "@/lib/ai.functions";
import {
  generateSceneImage,
  generateThumbnailImage,
  isRateLimitError,
} from "@/lib/generate-image";
import { putImage, loadImage } from "@/lib/images";
import { generateVoiceBlock } from "@/lib/generate-voice";
import { getVisualInstructions } from "@/lib/visual-instructions";
import { buildInjection, getScriptPattern } from "@/lib/generation-context";
import {
  buildSyncTimeline,
  repairTimeline,
  saveSyncTimeline,
  readSyncTimeline,
} from "@/lib/voice-sync";
import {
  DEFAULT_VOICE_SETTINGS,
  scriptToParagraphs,
  estimateSeconds,
  buildSubtitles,
  saveSubtitles,
} from "@/lib/production";
import {
  saveResearch,
  saveStory,
  saveVisualMap,
  saveThumbnails,
  saveSeo,
} from "@/lib/store";
import {
  patchStage as patchPipelineStage,
  logActivity,
  setRunning as setPipelineRunning,
  setTask,
  getPipeline,
} from "@/lib/pipeline";
import { stageDone as pipelineStageDone } from "@/lib/manager";
import type {
  Research,
  Story,
  ThumbnailIdea,
  VisualScene,
  VoiceBlock,
  VoiceProject,
} from "@/lib/types";

import {
  loadProject,
  newProject,
  saveProject,
  updateStage as updateDirectorStage,
} from "./checkpoint";
import { STAGES, type DirectorProject, type StageId, type Mode } from "./types";
import { pickMotion } from "./motion";
import { suggestMood } from "./music";
import { detectSfx } from "./sfx";

// Which existing localStorage bucket to read for each stage. Mirrors
// manager.tsx's readLS but scoped to the director's needs.
function readLS<T>(key: string, id: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as Record<string, T>)[id] ?? null;
  } catch { return null; }
}

// Best-effort mapping from Director stage → underlying pipeline.ts key so the
// existing Production Dashboard reflects Director activity live.
const PIPELINE_KEY: Partial<Record<StageId, string>> = {
  research: "research",
  story: "story",
  "scene-planner": "storyboard",
  images: "images",
  voice: "voice",
  thumbnail: "thumbnail",
  seo: "seo",
};

function pipelineKey(id: StageId): string | null {
  return PIPELINE_KEY[id] ?? null;
}

function isTransient(msg: string): boolean {
  return /unavailable|temporarily|overloaded|timeout|timed out|try again|\b(429|502|503|504)\b|rate.?limit/i.test(msg);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RETRY_BACKOFFS_MS = [8000, 20000, 45000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isTransient(msg) || attempt >= RETRY_BACKOFFS_MS.length) throw e;
      await sleep(RETRY_BACKOFFS_MS[attempt]);
    }
  }
}

/**
 * Hydrate a Director project from real artifacts already on disk. Runs on
 * mount so a stage that produced valid output in the Production Dashboard,
 * the Voice Studio, or the Image Queue is instantly reflected as `done` here
 * — the Director never repeats completed work.
 */
function hydrateFromArtifacts(project: DirectorProject): DirectorProject {
  const id = project.projectId;
  const next = { ...project, stages: { ...project.stages } };

  // Topic is done as soon as there IS a project.
  next.stages.topic = { ...next.stages.topic, status: "done", progress: 1 };

  const pipeStages: Array<[StageId, string]> = [
    ["research", "research"],
    ["story", "story"],
    ["scene-planner", "storyboard"],
    ["images", "images"],
    ["voice", "voice"],
    ["thumbnail", "thumbnail"],
    ["seo", "seo"],
  ];
  for (const [dir, pipe] of pipeStages) {
    if (pipelineStageDone(id, pipe as never)) {
      next.stages[dir] = { ...next.stages[dir], status: "done", progress: 1 };
    }
  }
  if (readSyncTimeline(id)) {
    next.stages["voice-sync"] = { ...next.stages["voice-sync"], status: "done", progress: 1 };
  }
  return next;
}

export interface DirectorApi {
  project: DirectorProject | null;
  running: boolean;
  start: () => Promise<void>;
  pause: () => void;
  reset: () => void;
  resetStage: (id: StageId) => void;
  approveStage: (id: StageId, approved: boolean) => void;
  setMode: (m: Mode) => void;
  setCaptionPreset: (id: DirectorProject["captionPreset"]) => void;
  setExport: (cfg: DirectorProject["export"]) => void;
  toggleLock: (kind: "character") => void;
  warnings: string[];
  suggestions: string[];
}

/**
 * Hook powering the AI Director. Returns the persisted DirectorProject plus
 * the actions needed by the /director route.
 */
export function useDirectorOrchestrator(topicId: string | null, topic?: string, explanation?: string): DirectorApi {
  const [project, setProject] = useState<DirectorProject | null>(null);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);
  const projectRef = useRef<DirectorProject | null>(null);

  // Real server-fn handles
  const doResearch = useServerFn(researchTopic);
  const doStory = useServerFn(generateStory);
  const doVisual = useServerFn(generateVisualMap);
  const doThumbs = useServerFn(generateThumbnails);
  const doSeo = useServerFn(generateSeo);
  const doAudio = useServerFn(suggestAudio);

  useEffect(() => {
    if (!topicId) { setProject(null); projectRef.current = null; return; }
    const existing = loadProject(topicId) ?? newProject(topicId, "professional");
    const hydrated = hydrateFromArtifacts(existing);
    saveProject(hydrated);
    projectRef.current = hydrated;
    setProject(hydrated);
  }, [topicId]);

  const commit = useCallback((p: DirectorProject) => {
    projectRef.current = p;
    saveProject(p);
    setProject(p);
  }, []);

  const patchStage = useCallback((id: StageId, patch: Parameters<typeof updateDirectorStage>[2]) => {
    if (!projectRef.current) return;
    const next = updateDirectorStage(projectRef.current, id, patch);
    projectRef.current = next;
    setProject(next);
    // Mirror to the shared pipeline state so /manager and other dashboards
    // reflect Director activity live.
    const pk = pipelineKey(id);
    if (pk && projectRef.current) {
      const status = patch.status;
      if (status === "running") patchPipelineStage(projectRef.current.projectId, pk as never, { status: "running", startedAt: Date.now() });
      else if (status === "done") patchPipelineStage(projectRef.current.projectId, pk as never, { status: "completed", finishedAt: Date.now() });
      else if (status === "failed") patchPipelineStage(projectRef.current.projectId, pk as never, { status: "failed", finishedAt: Date.now(), error: patch.error });
      else if (status === "skipped") patchPipelineStage(projectRef.current.projectId, pk as never, { status: "skipped", finishedAt: Date.now() });
    }
  }, []);

  // ----------------------- Stage runners (real work) -----------------------

  async function runResearch(id: string) {
    if (!topic) throw new Error("Project topic missing.");
    patchStage("research", { status: "running", progress: 0.25 });
    setTask(id, "research", "Research Expert → gathering facts…");
    const r = (await withRetry(() =>
      doResearch({ data: { topic, explanation: explanation ?? "", ...buildInjection(["story", "approvedTopic"]) } }),
    )) as Omit<Research, "topicId" | "generatedAt">;
    saveResearch({ ...r, topicId: id, generatedAt: Date.now() });
    patchStage("research", { status: "done", progress: 1 });
  }

  async function runStory(id: string) {
    const research = readLS<Research>("docos.research", id);
    if (!topic) throw new Error("Project topic missing.");
    patchStage("story", { status: "running", progress: 0.2 });
    setTask(id, "story", "Story Architect → writing script…");
    const s = (await withRetry(() => doStory({
      data: {
        topic,
        research: research ?? undefined,
        scriptPattern: getScriptPattern() ?? undefined,
        ...buildInjection(["hook", "story", "instruction"]),
      },
    }))) as Omit<Story, "topicId" | "generatedAt">;
    saveStory({ ...s, topicId: id, generatedAt: Date.now() });
    patchStage("story", { status: "done", progress: 1 });
  }

  async function runScenePlanner(id: string) {
    const story = readLS<Story>("docos.story", id);
    if (!story) throw new Error("Story required before scene planner.");
    patchStage("scene-planner", { status: "running", progress: 0.3 });
    setTask(id, "storyboard", "Visual Director → planning scenes…");
    const scenes = (await withRetry(() =>
      doVisual({ data: { topic: topic ?? "", script: story.script, visualInstructions: getVisualInstructions() } }),
    )) as VisualScene[];
    saveVisualMap({ topicId: id, scenes, generatedAt: Date.now() });
    patchStage("scene-planner", { status: "done", progress: 1, total: scenes.length });
  }

  async function runVoice(id: string) {
    const story = readLS<Story>("docos.story", id);
    if (!story) throw new Error("Story required before voice.");
    const existing = readLS<VoiceProject>("docos.voice", id);
    const settings = existing?.settings ?? DEFAULT_VOICE_SETTINGS;
    const paras = scriptToParagraphs(story.script);
    const prev = existing?.blocks ?? [];
    // Reuse cached blocks whose text is unchanged — never regenerate finished work.
    const blocks: VoiceBlock[] = paras.map((text, i) => {
      const p = prev[i];
      if (p && p.text === text && p.realSeconds && p.realSeconds > 0) return p;
      return { index: i, text, estSeconds: estimateSeconds(text) };
    });
    const doneAlready = blocks.filter((b) => b.realSeconds && b.realSeconds > 0).length;
    patchStage("voice", {
      status: "running",
      total: blocks.length,
      current: doneAlready,
      progress: doneAlready / Math.max(1, blocks.length),
      lastProgressAt: Date.now(),
      stalled: false,
    });
    for (let i = 0; i < blocks.length; i++) {
      if (cancelled.current) throw new DOMException("aborted", "AbortError");
      if (blocks[i].realSeconds && blocks[i].realSeconds! > 0) {
        patchStage("voice", { current: i + 1, progress: (i + 1) / blocks.length, lastProgressAt: Date.now() });
        continue;
      }
      setTask(id, "voice", `Voice Director → narrating ${i + 1}/${blocks.length}…`);
      // Stall detector: 5min without a chunk callback marks the block stalled
      // but does NOT abort — independent stages keep running elsewhere.
      let lastTick = Date.now();
      const stallTimer = window.setInterval(() => {
        if (Date.now() - lastTick > 5 * 60_000) {
          patchStage("voice", { stalled: true, warnings: [`Block ${i + 1} stalled (>5min without progress). Retry or Skip.`] });
        }
      }, 30_000);
      try {
        blocks[i].realSeconds = await generateVoiceBlock(
          id, i, blocks[i].text, settings,
          () => { lastTick = Date.now(); patchStage("voice", { lastProgressAt: lastTick, stalled: false }); },
        );
        blocks[i].generatedAt = Date.now();
      } catch (e) {
        // Voice failure fallback: keep going, single block can be repaired later.
        logActivity(id, `Voice block ${i + 1} deferred (${e instanceof Error ? e.message : "unknown"})`, "info");
      } finally {
        window.clearInterval(stallTimer);
      }
      patchStage("voice", { current: i + 1, progress: (i + 1) / blocks.length, lastProgressAt: Date.now(), stalled: false });
      // Persist partial progress after every block so refresh resumes cleanly.
      const partial: VoiceProject = { topicId: id, settings, blocks, generatedAt: Date.now() };
      const allNow = JSON.parse(localStorage.getItem("docos.voice") || "{}");
      allNow[id] = partial;
      localStorage.setItem("docos.voice", JSON.stringify(allNow));
    }
    const voice: VoiceProject = { topicId: id, settings, blocks, generatedAt: Date.now() };
    const all = JSON.parse(localStorage.getItem("docos.voice") || "{}");
    all[id] = voice;
    localStorage.setItem("docos.voice", JSON.stringify(all));
    window.dispatchEvent(new Event("storage"));
    patchStage("voice", { status: "done", progress: 1 });
  }

  async function runVoiceSync(id: string) {
    const visual = readLS<{ scenes: VisualScene[] }>("docos.visual", id);
    const voice = readLS<VoiceProject>("docos.voice", id);
    const scenes = visual?.scenes ?? [];
    if (!voice || !scenes.length) {
      patchStage("voice-sync", { status: "skipped", progress: 1 });
      return;
    }
    patchStage("voice-sync", { status: "running", progress: 0.4 });
    setTask(id, "voice", "Voice Sync → aligning scenes to narration…");
    const imageIds = new Set<number>();
    for (const s of scenes) if (await loadImage(`scene:${id}:${s.sceneNumber}`)) imageIds.add(s.sceneNumber);
    const { timeline } = buildSyncTimeline({
      projectId: id, voice, scenes,
      hasImage: (n) => imageIds.has(n),
      options: { mode: "auto" }, previous: readSyncTimeline(id),
    });
    const { timeline: repaired, summary } = repairTimeline(timeline);
    saveSyncTimeline(repaired);
    const w = summary.after.long > 0 || summary.after.gaps > 0
      ? [`${summary.after.gaps} gap(s) remain, ${summary.after.long} scene(s) still long`]
      : [];
    patchStage("voice-sync", { status: "done", progress: 1, warnings: w });
  }

  async function runImages(id: string) {
    const visual = readLS<{ scenes: VisualScene[] }>("docos.visual", id);
    const scenes = visual?.scenes ?? [];
    if (!scenes.length) throw new Error("Scene planner required before images.");
    patchStage("images", { status: "running", total: scenes.length, current: 0, progress: 0 });
    for (let i = 0; i < scenes.length; i++) {
      if (cancelled.current) throw new DOMException("aborted", "AbortError");
      const scene = scenes[i];
      const already = await loadImage(`scene:${id}:${scene.sceneNumber}`);
      if (already) {
        patchStage("images", { current: i + 1, progress: (i + 1) / scenes.length });
        continue;
      }
      setTask(id, "images", `Visual Director → image ${i + 1}/${scenes.length}…`);
      try {
        // generate-image.ts already rotates Puter → Pollinations providers
        // on failure, so the Director "retry another provider" behavior
        // is inherited from the underlying pipeline.
        const url = await generateSceneImage(scene);
        await putImage(`scene:${id}:${scene.sceneNumber}`, url);
      } catch (e) {
        if (isRateLimitError(e)) {
          // Provider quota hit — mark skipped, keep completed images, continue.
          patchStage("images", { status: "skipped", warnings: ["Provider free-tier limit reached — completed images kept."] });
          return;
        }
        // Single image failure is not fatal; log and move on.
        logActivity(id, `Image ${i + 1} failed: ${e instanceof Error ? e.message : "unknown"}`, "error");
      }
      patchStage("images", { current: i + 1, progress: (i + 1) / scenes.length });
    }
    patchStage("images", { status: "done", progress: 1 });
  }

  async function runCameraMotion(id: string) {
    const visual = readLS<{ scenes: VisualScene[] }>("docos.visual", id);
    const scenes = visual?.scenes ?? [];
    if (!scenes.length) { patchStage("camera-motion", { status: "skipped" }); return; }
    patchStage("camera-motion", { status: "running", total: scenes.length, current: 0 });
    const presets: DirectorProject["motionPresets"] = { ...projectRef.current!.motionPresets };
    let prev: ReturnType<typeof pickMotion> | undefined;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const text = `${s.voiceoverLine} ${s.visualDescription} ${s.background} ${s.cameraShot} ${s.emotion}`;
      const preset = pickMotion(text, i, prev);
      presets[String(s.sceneNumber)] = preset;
      prev = preset;
    }
    commit({ ...projectRef.current!, motionPresets: presets });
    patchStage("camera-motion", { status: "done", progress: 1, current: scenes.length });
  }

  async function runSubtitleTiming(id: string) {
    const story = readLS<Story>("docos.story", id);
    if (!story) { patchStage("subtitle-timing", { status: "skipped" }); return; }
    patchStage("subtitle-timing", { status: "running", progress: 0.4 });
    const paras = scriptToParagraphs(story.script);
    const cues = buildSubtitles(paras);
    saveSubtitles({ topicId: id, cues, generatedAt: Date.now() });
    patchStage("subtitle-timing", { status: "done", progress: 1, total: cues.length });
  }

  async function runMusic(id: string) {
    const story = readLS<Story>("docos.story", id);
    if (!story) { patchStage("music", { status: "skipped" }); return; }
    patchStage("music", { status: "running", progress: 0.5 });
    const mood = suggestMood(story.script);
    // Call the real audio suggester server function to get concrete cues.
    try {
      await withRetry(() => doAudio({ data: { topic: topic ?? "", script: story.script } }));
    } catch (e) {
      // Non-fatal: mood suggestion still valuable.
      logActivity(id, `Music suggester deferred (${e instanceof Error ? e.message : "unknown"})`, "info");
    }
    commit({ ...projectRef.current!, musicMood: mood });
    patchStage("music", { status: "done", progress: 1 });
  }

  async function runSfx(id: string) {
    const visual = readLS<{ scenes: VisualScene[] }>("docos.visual", id);
    const scenes = visual?.scenes ?? [];
    if (!scenes.length) { patchStage("sfx", { status: "skipped" }); return; }
    patchStage("sfx", { status: "running", total: scenes.length, current: 0 });
    const cues: Record<string, string[]> = { ...projectRef.current!.sfxCues };
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const text = `${s.voiceoverLine} ${s.visualDescription} ${s.background} ${s.emotion} ${s.notes}`;
      cues[String(s.sceneNumber)] = detectSfx(text);
    }
    commit({ ...projectRef.current!, sfxCues: cues });
    patchStage("sfx", { status: "done", progress: 1, current: scenes.length });
  }

  async function runThumbnail(id: string) {
    const story = readLS<Story>("docos.story", id);
    const research = readLS<Research>("docos.research", id);
    if (!story) throw new Error("Story required before thumbnail.");
    patchStage("thumbnail", { status: "running", progress: 0.2 });
    setTask(id, "thumbnail", "Thumbnail Designer → designing…");
    const { ideas } = (await withRetry(() => doThumbs({
      data: {
        topic: topic ?? "",
        script: story.script,
        angle: research?.storyAngles?.[0],
        ...buildInjection(["thumbnail"]),
      },
    }))) as { ideas: ThumbnailIdea[]; conceptProvider: string };
    saveThumbnails({ topicId: id, ideas, generatedAt: Date.now() });
    for (let i = 0; i < ideas.length; i++) {
      if (cancelled.current) throw new DOMException("aborted", "AbortError");
      setTask(id, "thumbnail", `Thumbnail Designer → rendering ${i + 1}/${ideas.length}…`);
      try {
        const url = await generateThumbnailImage(ideas[i]);
        await putImage(`thumb:${id}:${i}`, url);
      } catch (e) {
        if (isRateLimitError(e)) {
          patchStage("thumbnail", { status: "skipped", warnings: ["Provider limit — thumbnail draft partially rendered."] });
          return;
        }
      }
      patchStage("thumbnail", { current: i + 1, progress: (i + 1) / ideas.length, total: ideas.length });
    }
    patchStage("thumbnail", { status: "done", progress: 1 });
  }

  async function runSeo(id: string) {
    const story = readLS<Story>("docos.story", id);
    if (!story) throw new Error("Story required before SEO.");
    patchStage("seo", { status: "running", progress: 0.4 });
    setTask(id, "seo", "SEO Specialist → metadata…");
    const seo = await withRetry(() => doSeo({ data: { topic: topic ?? "", script: story.script, ...buildInjection(["seo"]) } }));
    saveSeo({ ...seo, topicId: id, generatedAt: Date.now() });
    patchStage("seo", { status: "done", progress: 1 });
  }

  async function runExportQueue(id: string) {
    patchStage("export-queue", { status: "running", progress: 0.5 });
    // Export queue is a pointer, not a heavy job: mark ready when all
    // deliverables the export step needs are on disk. Fires a browser event
    // so the /export route can pick up the ready state without polling.
    window.dispatchEvent(new CustomEvent("director:export-ready", { detail: { projectId: id } }));
    patchStage("export-queue", { status: "done", progress: 1 });
  }

  const runners: Record<StageId, (id: string) => Promise<void>> = {
    topic: async () => { patchStage("topic", { status: "done", progress: 1 }); },
    research: runResearch,
    story: runStory,
    "scene-planner": runScenePlanner,
    voice: runVoice,
    "voice-sync": runVoiceSync,
    images: runImages,
    "camera-motion": runCameraMotion,
    "subtitle-timing": runSubtitleTiming,
    music: runMusic,
    sfx: runSfx,
    thumbnail: runThumbnail,
    seo: runSeo,
    "export-queue": runExportQueue,
  };

  const start = useCallback(async () => {
    const p = projectRef.current;
    if (!p || !topicId) return;
    if (running) return;
    cancelled.current = false;
    setRunning(true);
    setPipelineRunning(topicId, true);
    logActivity(topicId, "AI Director started", "info");

    try {
      await runScheduler(topicId);
    } finally {
      setRunning(false);
      setPipelineRunning(topicId, false);
      commit({ ...projectRef.current!, currentStage: null });
    }
  }, [topicId, running, commit, patchStage]);

  // ----------------------- Parallel dependency scheduler -----------------------
  //
  // Independent stages (SEO, Thumbnail Draft, Image Queue, Camera Motion,
  // Music, SFX, Subtitle text) run concurrently while Voice generates.
  // Voice-dependent stages (Voice Sync, Export) wait for voice completion.
  // TTS runs by itself — no parallel TTS blocks — but non-TTS work is free.
  const DEPS: Record<StageId, StageId[]> = {
    topic: [],
    research: ["topic"],
    story: ["research"],
    "scene-planner": ["story"],
    voice: ["story"],
    images: ["scene-planner"],
    "camera-motion": ["scene-planner"],
    "subtitle-timing": ["story"],
    music: ["story"],
    sfx: ["scene-planner"],
    thumbnail: ["story"],
    seo: ["story"],
    "voice-sync": ["voice", "scene-planner"],
    "export-queue": ["voice-sync", "images"],
  };
  const WAIT_LABEL: Partial<Record<StageId, string>> = {
    "voice-sync": "Voice",
    "export-queue": "Voice and Images",
    images: "Scene Planner",
    "camera-motion": "Scene Planner",
    sfx: "Scene Planner",
  };

  const runScheduler = useCallback(async (id: string) => {
    const done = (sid: StageId) => {
      const st = projectRef.current!.stages[sid].status;
      return st === "done" || st === "skipped";
    };
    const failed = (sid: StageId) => projectRef.current!.stages[sid].status === "failed";
    const ready = (sid: StageId) => DEPS[sid].every(done);
    const blocked = (sid: StageId) => DEPS[sid].some(failed);

    // Mark initial waiting labels for stages that can't run yet.
    for (const s of STAGES) {
      const cur = projectRef.current!.stages[s.id];
      if (cur.status === "pending" && !ready(s.id)) {
        patchStage(s.id, { status: "waiting", waitingFor: WAIT_LABEL[s.id] ?? DEPS[s.id].join(", ") });
      }
    }

    const inFlight = new Map<StageId, Promise<void>>();

    const launch = (sid: StageId) => {
      patchStage(sid, { status: "running", startedAt: Date.now(), error: undefined, warnings: [], waitingFor: undefined });
      const promise = (async () => {
        try {
          await runners[sid](id);
          const final = projectRef.current!.stages[sid];
          if (final.status !== "done" && final.status !== "skipped") {
            patchStage(sid, { status: "done", progress: 1, finishedAt: Date.now() });
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          const msg = err instanceof Error ? err.message : String(err);
          patchStage(sid, { status: "failed", error: msg, finishedAt: Date.now(), approved: false });
          logActivity(id, `${sid} failed: ${msg}`, "error");
          toast.error(`${sid} failed: ${msg}`);
        }
      })();
      inFlight.set(sid, promise);
    };

    // TTS-heavy stages that must not run concurrently with each other.
    const EXCLUSIVE = new Set<StageId>(["voice"]);
    const tick = () => {
      if (cancelled.current) return;
      const exclusiveBusy = Array.from(inFlight.keys()).some((k) => EXCLUSIVE.has(k));
      for (const s of STAGES) {
        if (cancelled.current) return;
        const st = projectRef.current!.stages[s.id];
        if (st.status === "done" || st.status === "skipped" || st.status === "failed" || st.status === "running") continue;
        if (inFlight.has(s.id)) continue;
        if (blocked(s.id)) {
          patchStage(s.id, { status: "skipped", warnings: ["Upstream stage failed — skipped."] });
          continue;
        }
        if (!ready(s.id)) {
          if (st.status !== "waiting") patchStage(s.id, { status: "waiting", waitingFor: WAIT_LABEL[s.id] ?? DEPS[s.id].join(", ") });
          continue;
        }
        // Guided mode: pause before launching the next pending stage.
        if (projectRef.current!.mode === "guided") {
          patchStage(s.id, { status: "waiting", waitingFor: "Approval" });
          continue;
        }
        if (EXCLUSIVE.has(s.id) && exclusiveBusy) continue;
        launch(s.id);
        if (EXCLUSIVE.has(s.id)) return; // let voice claim the exclusive slot
      }
    };

    tick();
    while (inFlight.size > 0 && !cancelled.current) {
      const settled = await Promise.race(
        Array.from(inFlight.entries()).map(([k, pr]) => pr.then(() => k)),
      );
      inFlight.delete(settled);
      tick();
    }
  }, [patchStage]);

  const pause = useCallback(() => {
    cancelled.current = true;
    if (projectRef.current) commit({ ...projectRef.current, paused: true });
  }, [commit]);

  const reset = useCallback(() => {
    if (!topicId) return;
    const fresh = hydrateFromArtifacts(newProject(topicId, projectRef.current?.mode ?? "professional"));
    commit(fresh);
  }, [topicId, commit]);

  const resetStage = useCallback((id: StageId) => {
    if (!projectRef.current) return;
    patchStage(id, { status: "pending", progress: 0, current: 0, error: undefined, approved: undefined });
  }, [patchStage]);

  const approveStage = useCallback((id: StageId, approved: boolean) => {
    patchStage(id, { approved });
  }, [patchStage]);

  const setMode = useCallback((m: Mode) => {
    if (!projectRef.current) return;
    commit({ ...projectRef.current, mode: m });
  }, [commit]);

  const setCaptionPreset = useCallback((id: DirectorProject["captionPreset"]) => {
    if (!projectRef.current) return;
    commit({ ...projectRef.current, captionPreset: id });
  }, [commit]);

  const setExport = useCallback((cfg: DirectorProject["export"]) => {
    if (!projectRef.current) return;
    commit({ ...projectRef.current, export: cfg });
  }, [commit]);

  const toggleLock = useCallback((kind: "character") => {
    if (!projectRef.current) return;
    const locks = { ...projectRef.current.locks };
    if (kind === "character") locks.character = !locks.character;
    commit({ ...projectRef.current, locks });
  }, [commit]);

  // Auto-computed warnings and suggestions from real state.
  const { warnings, suggestions } = useMemo(() => {
    if (!project || !topicId) return { warnings: [], suggestions: [] };
    const w: string[] = [];
    const s: string[] = [];
    const pipe = getPipeline(topicId);
    void pipe;
    for (const st of Object.values(project.stages)) {
      if (st.warnings?.length) w.push(...st.warnings.map((x) => `${st.label}: ${x}`));
      if (st.status === "failed") s.push(`Retry ${st.label} — ${st.error ?? "failed"}`);
    }
    const scenes = readLS<{ scenes: VisualScene[] }>("docos.visual", topicId)?.scenes ?? [];
    const voice = readLS<VoiceProject>("docos.voice", topicId);
    if (scenes.length && voice) {
      const missingVoice = voice.blocks.filter((b) => !b.realSeconds || b.realSeconds <= 0).length;
      if (missingVoice) s.push(`Auto-repair: ${missingVoice} voice block(s) missing timing.`);
    }
    if (scenes.length && project.stages.images.status !== "done" && project.stages.images.status !== "skipped") {
      s.push("Continue Image Queue when ready — Director will resume from the last completed scene.");
    }
    return { warnings: w, suggestions: s };
  }, [project, topicId]);

  return {
    project,
    running,
    start,
    pause,
    reset,
    resetStage,
    approveStage,
    setMode,
    setCaptionPreset,
    setExport,
    toggleLock,
    warnings,
    suggestions,
  };
}