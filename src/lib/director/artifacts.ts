// Real artifact validators for every Director stage. Never trusts a boolean
// "started" flag or the presence of a partial file — every status here is
// derived from persisted output that a downstream stage could actually
// consume. This is the single source of truth for stage completion.
import { hasStoredIdWithPrefix } from "@/lib/images";
import { readSyncTimeline } from "@/lib/voice-sync";
import { getVoiceMeta } from "@/lib/generate-voice";
import { scriptToParagraphs, DEFAULT_VOICE_SETTINGS } from "@/lib/production";
import { sanitizeNarration } from "@/lib/sanitize-narration";
import { hashText } from "@/lib/local-tts/wav";
import { ENGINE_VERSION } from "@/lib/local-tts/presets";
import type {
  Research,
  Story,
  ThumbnailPack,
  Seo,
  SubtitlePack,
  VisualScene,
  VoiceProject,
} from "@/lib/types";
import type { StageId, StageStatus, DirectorProject } from "./types";

function readLS<T>(key: string, id: string): T | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) return null;
    return (JSON.parse(raw) as Record<string, T>)[id] ?? null;
  } catch { return null; }
}

export interface ArtifactState {
  status: StageStatus;
  progress: number;
  current?: number;
  total?: number;
  error?: string;
  warnings?: string[];
}

const READY: ArtifactState = { status: "pending", progress: 0 };

function done(current?: number, total?: number): ArtifactState {
  return { status: "done", progress: 1, current, total };
}

function running(current: number, total: number, warnings?: string[]): ArtifactState {
  return {
    status: "running",
    progress: total > 0 ? current / total : 0,
    current,
    total,
    warnings,
  };
}

/** Count voice blocks whose persisted WAV + metadata match the current text. */
export function validVoiceBlocks(
  projectId: string,
  story: Story | null,
  project: VoiceProject | null,
): { valid: number; total: number } {
  const paras = story ? scriptToParagraphs(story.script) : [];
  const total = paras.length;
  if (!total) return { valid: 0, total: 0 };
  const settings = project?.settings ?? DEFAULT_VOICE_SETTINGS;
  const presetId = settings.voicePresetId ?? "young-smooth-male";
  let valid = 0;
  for (let i = 0; i < total; i++) {
    const clean = sanitizeNarration(paras[i]);
    if (!clean.trim()) continue;
    const meta = getVoiceMeta(`voice:${projectId}:${i}`);
    if (!meta) continue;
    if (meta.duration <= 0) continue;
    if (meta.engineVersion !== ENGINE_VERSION) continue;
    if (meta.voicePresetId !== presetId) continue;
    if (meta.textHash !== hashText(clean)) continue;
    valid++;
  }
  return { valid, total };
}

/** Compute the real state of every Director stage from persisted artifacts. */
export function computeStageStates(
  projectId: string,
  project: DirectorProject,
): Record<StageId, ArtifactState> {
  const research = readLS<Research>("docos.research", projectId);
  const story = readLS<Story>("docos.story", projectId);
  const visual = readLS<{ scenes: VisualScene[] }>("docos.visual", projectId);
  const voice = readLS<VoiceProject>("docos.voice", projectId);
  const thumb = readLS<ThumbnailPack>("docos.thumbnails", projectId);
  const seo = readLS<Seo>("docos.seo", projectId);
  const subtitles = readLS<SubtitlePack>("docos.subtitles", projectId);
  const sync = readSyncTimeline(projectId);
  const scenes = visual?.scenes ?? [];

  const out = {} as Record<StageId, ArtifactState>;

  out.topic = done();
  out.research = research && Object.keys(research).length > 0 ? done() : READY;
  out.story = story && typeof story.script === "string" && story.script.trim().length > 0
    ? done()
    : READY;

  // Scene planner: real scenes with valid numbers + descriptions.
  if (!story) {
    out["scene-planner"] = { status: "waiting", progress: 0, error: "Waiting for Story" };
  } else if (!scenes.length) {
    out["scene-planner"] = READY;
  } else {
    const good = scenes.filter(
      (s) => typeof s.sceneNumber === "number" && s.sceneNumber > 0 &&
             (String(s.visualDescription ?? "").trim().length > 0 ||
              String(s.voiceoverLine ?? "").trim().length > 0),
    ).length;
    out["scene-planner"] = good === scenes.length ? done(good, scenes.length) : {
      status: "failed",
      progress: good / scenes.length,
      current: good,
      total: scenes.length,
      error: "Scene plan incomplete — retry available.",
    };
  }

  // Voice: strictly counted from persisted per-block WAV metadata.
  const v = validVoiceBlocks(projectId, story, voice);
  if (!story) {
    out.voice = { status: "waiting", progress: 0, error: "Waiting for Story" };
  } else if (v.total === 0) {
    out.voice = READY;
  } else if (v.valid === v.total) {
    out.voice = done(v.valid, v.total);
  } else {
    out.voice = {
      status: v.valid > 0 ? "failed" : "pending",
      progress: v.valid / v.total,
      current: v.valid,
      total: v.total,
      error: v.valid > 0
        ? `Voice incomplete — ${v.valid}/${v.total} blocks. Resume Production to continue.`
        : undefined,
    };
  }

  // Voice sync: needs every voice block valid AND a saved sync model.
  if (!scenes.length) {
    out["voice-sync"] = { status: "waiting", progress: 0, error: "Waiting for Scene Planner" };
  } else if (v.total === 0 || v.valid < v.total) {
    out["voice-sync"] = {
      status: "waiting",
      progress: 0,
      error: `Waiting for Voice — ${v.valid}/${Math.max(1, v.total)} blocks valid`,
    };
  } else if (!sync) {
    out["voice-sync"] = READY;
  } else {
    out["voice-sync"] = done();
  }

  // Image queue: strictly per-scene image presence.
  if (!scenes.length) {
    out.images = { status: "waiting", progress: 0, error: "Waiting for Scene Planner" };
  } else {
    let imgOk = 0;
    for (const s of scenes) {
      if (hasStoredIdWithPrefix(`scene:${projectId}:${s.sceneNumber}`)) imgOk++;
    }
    out.images = imgOk === scenes.length
      ? done(imgOk, scenes.length)
      : imgOk > 0
        ? { status: "running", progress: imgOk / scenes.length, current: imgOk, total: scenes.length }
        : READY;
  }

  // Camera motion: needs a preset per scene (persisted on the director project).
  if (!scenes.length) {
    out["camera-motion"] = { status: "waiting", progress: 0, error: "Waiting for Scene Planner" };
  } else {
    const presets = project.motionPresets ?? {};
    const have = scenes.filter((s) => presets[String(s.sceneNumber)]).length;
    out["camera-motion"] = have === scenes.length
      ? done(have, scenes.length)
      : have > 0
        ? { status: "running", progress: have / scenes.length, current: have, total: scenes.length }
        : READY;
  }

  // Subtitles: cues in the pack.
  if (!subtitles || !Array.isArray(subtitles.cues) || subtitles.cues.length === 0) {
    out["subtitle-timing"] = story ? READY : { status: "waiting", progress: 0, error: "Waiting for Story" };
  } else {
    const total = subtitles.cues.length;
    const timed = subtitles.cues.filter(
      (c) => typeof c.start === "number" && typeof c.end === "number" && c.end > c.start,
    ).length;
    out["subtitle-timing"] = timed === total ? done(timed, total) : {
      status: "running", progress: timed / total, current: timed, total,
    };
  }

  // Music: any explicit mood decision counts.
  out.music = project.musicMood ? done() : (story ? READY : { status: "waiting", progress: 0, error: "Waiting for Story" });

  // SFX: cues persisted per scene, or explicit empty set for every scene.
  if (!scenes.length) {
    out.sfx = { status: "waiting", progress: 0, error: "Waiting for Scene Planner" };
  } else {
    const cues = project.sfxCues ?? {};
    const decided = scenes.filter((s) => cues[String(s.sceneNumber)] !== undefined).length;
    out.sfx = decided === scenes.length
      ? done(decided, scenes.length)
      : decided > 0
        ? { status: "running", progress: decided / scenes.length, current: decided, total: scenes.length }
        : READY;
  }

  // Thumbnail: needs BOTH concept ideas AND at least one rendered thumb image.
  const ideas = Array.isArray(thumb?.ideas) ? thumb!.ideas : [];
  const hasThumbImg = hasStoredIdWithPrefix(`thumb:${projectId}:`);
  out.thumbnail = ideas.length > 0 && hasThumbImg
    ? done()
    : story ? READY : { status: "waiting", progress: 0, error: "Waiting for Story" };

  // SEO: title + description + tags all required.
  const seoOk = !!seo && ((seo.bestTitle?.trim().length ?? 0) > 0 || (seo.titleOptions?.length ?? 0) > 0) &&
    (seo.description?.trim().length ?? 0) > 0 &&
    (seo.tags?.length ?? 0) > 0;
  out.seo = seoOk ? done() : (story ? READY : { status: "waiting", progress: 0, error: "Waiting for Story" });

  // Export queue: never "done" until a real export artifact is on disk.
  const exportReady = hasStoredIdWithPrefix(`export:${projectId}:`);
  if (exportReady) {
    out["export-queue"] = done();
  } else {
    const missing: string[] = [];
    if (v.total === 0 || v.valid < v.total) missing.push("Voice");
    if (!sync) missing.push("Sync");
    if (out.images.status !== "done") missing.push("Images");
    out["export-queue"] = missing.length > 0
      ? { status: "waiting", progress: 0, error: `Waiting for ${missing.join(", ")}` }
      : READY;
  }

  return out;
}

/** Human-readable summary used by the "Recalculate Director Status" action. */
export function summarizeStates(states: Record<StageId, ArtifactState>): string[] {
  const lines: string[] = [];
  for (const [id, s] of Object.entries(states)) {
    const pct = Math.round(s.progress * 100);
    lines.push(`${id}: ${s.status}${s.total ? ` (${s.current ?? 0}/${s.total})` : ` ${pct}%`}${s.error ? ` — ${s.error}` : ""}`);
  }
  return lines;
}