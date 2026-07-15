import type { DirectorProject, StageId } from "./types";
import { STAGES } from "./types";
import { saveProject, updateStage } from "./checkpoint";
import { pickMotion } from "./motion";
import { detectSfx } from "./sfx";
import { suggestMood } from "./music";

type Ctx = {
  project: DirectorProject;
  scenes: Array<{ id: string; text: string }>;
  setProject: (p: DirectorProject) => void;
};

type StageRunner = (ctx: Ctx, signal: AbortSignal) => Promise<void>;

async function tick(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

const runners: Record<StageId, StageRunner> = {
  research: async (ctx, signal) => {
    const total = 4;
    for (let i = 1; i <= total; i++) {
      await tick(220, signal);
      ctx.project = updateStage(ctx.project, "research", {
        status: "running",
        current: i,
        total,
        progress: i / total,
      });
      ctx.setProject(ctx.project);
    }
  },
  story: async (ctx, signal) => {
    for (let i = 1; i <= 3; i++) {
      await tick(260, signal);
      ctx.project = updateStage(ctx.project, "story", {
        status: "running",
        current: i,
        total: 3,
        progress: i / 3,
      });
      ctx.setProject(ctx.project);
    }
  },
  storyboard: async (ctx, signal) => {
    const total = Math.max(1, ctx.scenes.length);
    for (let i = 1; i <= total; i++) {
      await tick(120, signal);
      ctx.project = updateStage(ctx.project, "storyboard", {
        status: "running",
        current: i,
        total,
        progress: i / total,
      });
      ctx.setProject(ctx.project);
    }
  },
  voice: async (ctx, signal) => {
    const total = Math.max(1, ctx.scenes.length);
    for (let i = 1; i <= total; i++) {
      await tick(180, signal);
      ctx.project = updateStage(ctx.project, "voice", {
        status: "running",
        current: i,
        total,
        progress: i / total,
      });
      ctx.setProject(ctx.project);
    }
  },
  "voice-sync": async (ctx, signal) => {
    await tick(500, signal);
    ctx.project = updateStage(ctx.project, "voice-sync", { progress: 1, current: 1, total: 1 });
    ctx.setProject(ctx.project);
  },
  images: async (ctx, signal) => {
    const total = Math.max(1, ctx.scenes.length);
    const startFrom = ctx.project.stages.images.current ?? 0;
    for (let i = startFrom + 1; i <= total; i++) {
      await tick(90, signal);
      ctx.project = updateStage(ctx.project, "images", {
        status: "running",
        current: i,
        total,
        progress: i / total,
      });
      ctx.setProject(ctx.project);
    }
  },
  motion: async (ctx, signal) => {
    const total = Math.max(1, ctx.scenes.length);
    const presets: DirectorProject["motionPresets"] = { ...ctx.project.motionPresets };
    let prev: ReturnType<typeof pickMotion> | undefined;
    for (let i = 0; i < total; i++) {
      await tick(40, signal);
      const scene = ctx.scenes[i];
      const preset = pickMotion(scene?.text ?? "", i, prev);
      presets[scene?.id ?? String(i)] = preset;
      prev = preset;
      ctx.project = updateStage(ctx.project, "motion", {
        status: "running",
        current: i + 1,
        total,
        progress: (i + 1) / total,
      });
      ctx.project = { ...ctx.project, motionPresets: presets };
      ctx.setProject(ctx.project);
    }
    saveProject(ctx.project);
  },
  captions: async (ctx, signal) => {
    for (let i = 1; i <= 3; i++) {
      await tick(160, signal);
      ctx.project = updateStage(ctx.project, "captions", {
        status: "running",
        current: i,
        total: 3,
        progress: i / 3,
      });
      ctx.setProject(ctx.project);
    }
  },
  music: async (ctx, signal) => {
    await tick(300, signal);
    const joined = ctx.scenes.map((s) => s.text).join(" ");
    const mood = suggestMood(joined);
    ctx.project = { ...ctx.project, musicMood: mood };
    ctx.project = updateStage(ctx.project, "music", { progress: 1, current: 1, total: 1 });
    ctx.setProject(ctx.project);
  },
  sfx: async (ctx, signal) => {
    const total = Math.max(1, ctx.scenes.length);
    const cues: Record<string, string[]> = { ...ctx.project.sfxCues };
    for (let i = 0; i < total; i++) {
      await tick(30, signal);
      const scene = ctx.scenes[i];
      cues[scene?.id ?? String(i)] = detectSfx(scene?.text ?? "");
      ctx.project = updateStage(ctx.project, "sfx", {
        status: "running",
        current: i + 1,
        total,
        progress: (i + 1) / total,
      });
      ctx.project = { ...ctx.project, sfxCues: cues };
      ctx.setProject(ctx.project);
    }
  },
  color: async (ctx, signal) => {
    for (let i = 1; i <= 4; i++) {
      await tick(180, signal);
      ctx.project = updateStage(ctx.project, "color", {
        status: "running",
        current: i,
        total: 4,
        progress: i / 4,
      });
      ctx.setProject(ctx.project);
    }
  },
  transitions: async (ctx, signal) => {
    const total = Math.max(1, ctx.scenes.length);
    for (let i = 1; i <= total; i++) {
      await tick(35, signal);
      ctx.project = updateStage(ctx.project, "transitions", {
        status: "running",
        current: i,
        total,
        progress: i / total,
      });
      ctx.setProject(ctx.project);
    }
  },
  render: async (ctx, signal) => {
    const total = 100;
    const startFrom = ctx.project.stages.render.current ?? 0;
    for (let i = startFrom + 1; i <= total; i++) {
      await tick(35, signal);
      ctx.project = updateStage(ctx.project, "render", {
        status: "running",
        current: i,
        total,
        progress: i / total,
      });
      ctx.setProject(ctx.project);
    }
  },
};

export type PipelineEvents = {
  onStageStart?: (id: StageId) => void;
  onStageDone?: (id: StageId) => void;
  onStageError?: (id: StageId, err: Error) => void;
  onIdle?: () => void;
  /** Guided mode: return true to continue, false to pause. */
  shouldContinue?: (nextId: StageId) => boolean | Promise<boolean>;
};

export class DirectorEngine {
  private controller = new AbortController();
  private running = false;

  constructor(private ctx: Ctx, private events: PipelineEvents = {}) {}

  get isRunning() { return this.running; }

  updateContext(patch: Partial<Ctx>) {
    this.ctx = { ...this.ctx, ...patch };
  }

  async run() {
    if (this.running) return;
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;

    try {
      for (const stage of STAGES) {
        const st = this.ctx.project.stages[stage.id];
        if (st.status === "done") continue; // checkpoint skip

        if (this.ctx.project.mode === "guided" && st.status === "pending") {
          const cont = await (this.events.shouldContinue?.(stage.id) ?? true);
          if (!cont) {
            this.ctx.project = updateStage(this.ctx.project, stage.id, { status: "waiting" });
            this.ctx.setProject(this.ctx.project);
            break;
          }
        }

        this.events.onStageStart?.(stage.id);
        this.ctx.project = updateStage(this.ctx.project, stage.id, {
          status: "running",
          startedAt: Date.now(),
          error: undefined,
        });
        this.ctx.project = { ...this.ctx.project, currentStage: stage.id };
        this.ctx.setProject(this.ctx.project);

        try {
          await runners[stage.id](this.ctx, signal);
          this.ctx.project = updateStage(this.ctx.project, stage.id, {
            status: "done",
            progress: 1,
            finishedAt: Date.now(),
          });
          this.ctx.setProject(this.ctx.project);
          this.events.onStageDone?.(stage.id);

          if (this.ctx.project.mode === "guided") {
            // Guided: stop after each stage
            break;
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") break;
          const msg = err instanceof Error ? err.message : String(err);
          this.ctx.project = updateStage(this.ctx.project, stage.id, {
            status: "failed",
            error: msg,
          });
          this.ctx.setProject(this.ctx.project);
          this.events.onStageError?.(stage.id, err as Error);
          break;
        }
      }
    } finally {
      this.running = false;
      this.events.onIdle?.();
    }
  }

  pause() {
    this.controller.abort();
    this.running = false;
    this.ctx.project = { ...this.ctx.project, paused: true };
    saveProject(this.ctx.project);
    this.ctx.setProject(this.ctx.project);
  }

  reset(stageId?: StageId) {
    const stages = { ...this.ctx.project.stages };
    if (stageId) {
      stages[stageId] = { ...stages[stageId], status: "pending", progress: 0, current: 0, error: undefined };
    } else {
      for (const s of STAGES) {
        stages[s.id] = { ...stages[s.id], status: "pending", progress: 0, current: 0, error: undefined };
      }
    }
    this.ctx.project = { ...this.ctx.project, stages, currentStage: null, paused: false };
    saveProject(this.ctx.project);
    this.ctx.setProject(this.ctx.project);
  }
}