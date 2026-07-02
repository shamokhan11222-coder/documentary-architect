import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  X,
  Check,
  FolderPlus,
  ArrowRight,
  Sparkles,
  Clock,
  Gauge,
  Coins,
  ListVideo,
  Image as ImageIcon,
  ImagePlus,
  Mic,
  Download,
  Activity,
  CircleDot,
  CheckCircle2,
  Play,
  Zap,
} from "lucide-react";

import { generateHomeIdeas } from "@/lib/ai.functions";
import { LogoLoading } from "@/components/Logo";
import {
  saveTopic,
  setSelectedTopicId,
  useTaste,
  addTaste,
  useTopics,
  useProjectStatus,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { useActiveProvider } from "@/lib/provider";
import { useSelectedProject } from "@/components/ProjectPicker";
import { PIPELINE, completionPercent, nextStage, stageDone, type StageKey } from "@/lib/manager";
import { usePipeline, etaRemainingMs, fmtDuration } from "@/lib/pipeline";
import { useCreditConfig } from "@/lib/credit-mode";
import { useImage } from "@/lib/images";
import { useLocal } from "@/lib/local";
import {
  AnimatedNumber,
  Reveal,
  AIThinking,
  WaveBars,
  IndeterminateBar,
} from "@/components/motion";
import type { GeneratedIdea, IdeaCategory } from "@/lib/types";

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;
const thumbImageId = (topicId: string, i: number) => `thumb:${topicId}:${i}`;

const STAGE_ROUTE: Record<StageKey, string> = {
  research: "/research",
  story: "/story",
  storyboard: "/visual",
  images: "/visual",
  thumbnail: "/thumbnail",
  seo: "/seo",
  voice: "/voice",
  rating: "/rating",
};

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Home — Stickmax Studio" }] }),
  component: HomePage,
});

function HomePage() {
  const router = useRouter();
  const taste = useTaste();
  const activeProvider = useActiveProvider();
  const gen = useServerFn(generateHomeIdeas);
  const [categories, setCategories] = useState<IdeaCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setRejected(new Set());
    try {
      const data = (await gen({
        data: {
          liked: taste.liked,
          rejected: taste.rejected,
          completed: taste.completed,
        },
      })) as IdeaCategory[];
      setCategories(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load ideas");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (categories.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave(idea: GeneratedIdea) {
    addTaste("liked", idea.topic);
    saveTopic({ universe: "Home Feed", ...idea });
    toast.success("Saved to Projects");
  }

  function handleGenerateProject(idea: GeneratedIdea) {
    addTaste("liked", idea.topic);
    const t = saveTopic({ universe: "Home Feed", ...idea });
    setSelectedTopicId(t.id);
    router.navigate({ to: "/research" });
  }

  function handleReject(idea: GeneratedIdea) {
    addTaste("rejected", idea.topic);
    setRejected((prev) => new Set(prev).add(idea.topic));
    toast.message("Learned your taste — won't show similar ideas");
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <CommandCenter activeProviderName={activeProvider?.name ?? null} />

      {/* Idea feed */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">
            Fresh Documentary Ideas
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The Hidden Origins of Everyday Life — weak ideas auto-rejected; rejecting
            trains your taste.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {loading && categories.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-4">
          <LogoLoading />
          <AIThinking label="Your Topic Expert is curating fresh ideas" />
        </div>
      )}

      <div className="mt-8 space-y-10">
        {categories.map((cat) => {
          const ideas = cat.ideas.filter((i) => !rejected.has(i.topic));
          if (ideas.length === 0) return null;
          return (
            <section key={cat.category}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {cat.category}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {ideas.map((idea, i) => (
                  <div
                    key={idea.topic + i}
                    className="card-lift flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card animate-spring-in"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <div className="text-base font-semibold tracking-tight">
                      {idea.topic}
                    </div>
                    {idea.altTitle && (
                      <div className="mt-1 text-xs font-medium text-brand">
                        Alt: {idea.altTitle}
                      </div>
                    )}
                    <div className="mt-1 text-sm text-muted-foreground">
                      {idea.explanation}
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs">
                      {idea.coreMystery && (
                        <Detail label="Core mystery" value={idea.coreMystery} />
                      )}
                      {idea.whyClick && (
                        <Detail label="Why they click" value={idea.whyClick} />
                      )}
                      {idea.storyConflict && (
                        <Detail label="Conflict" value={idea.storyConflict} />
                      )}
                      {idea.hookAngle && (
                        <Detail label="Hook" value={idea.hookAngle} />
                      )}
                      {idea.visualPotential && (
                        <Detail label="Visual" value={idea.visualPotential} />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Score label="CTR" value={idea.ctrScore} />
                      <Score label="Evergreen" value={idea.evergreenScore} />
                      <Score label="Original" value={idea.originalityScore} />
                      <Meta label="Research" value={idea.researchDifficulty} />
                      <Meta label="Visual" value={idea.visualDifficulty} />
                      {idea.productionDifficulty && (
                        <Meta label="Production" value={idea.productionDifficulty} />
                      )}
                      <Meta label="Runtime" value={idea.estimatedLength} />
                    </div>
                    {idea.recommendation && (
                      <div className="mt-2 rounded-md bg-muted px-2 py-1 text-xs">
                        <span className="font-medium">Verdict:</span>{" "}
                        <span className="text-muted-foreground">{idea.recommendation}</span>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleGenerateProject(idea)}>
                        <FolderPlus className="mr-1 h-4 w-4" /> Generate Project
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSave(idea)}
                      >
                        <Check className="mr-1 h-4 w-4" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReject(idea)}
                      >
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 font-medium text-foreground/80">{label}:</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

/* ======================================================================
 * Production Command Center
 * ==================================================================== */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function CommandCenter({ activeProviderName }: { activeProviderName: string | null }) {
  const router = useRouter();
  const { selected } = useSelectedProject();
  const topics = useTopics();
  const active = selected ?? topics[0] ?? null;
  const activeId = active?.id ?? null;

  const pipeline = usePipeline(activeId);
  const status = useProjectStatus(activeId);
  const credit = useCreditConfig();
  const voiceMap = useLocal<Record<string, unknown>>("docos.voice", {});

  const percent = activeId ? completionPercent(activeId) : 0;
  const remainingMs = pipeline ? etaRemainingMs(pipeline) : 0;
  const running = pipeline?.running ?? false;
  const currentStageKey =
    pipeline?.currentStage ?? (activeId ? nextStage(activeId) : null);
  const currentStageDef = PIPELINE.find((s) => s.key === currentStageKey) ?? null;
  const next = activeId ? nextStage(activeId) : null;

  const doneStages = PIPELINE.filter((s) => activeId && stageDone(activeId, s.key)).length;
  const exportReady = [status.research, status.story, status.visual, status.thumbnail, status.seo].filter(Boolean).length;

  const sceneImg = useImage(activeId ? sceneImageId(activeId, 1) : null);
  const thumbImg = useImage(activeId ? thumbImageId(activeId, 0) : null);
  const hasVoice = !!(activeId && voiceMap[activeId]);

  const activity = pipeline?.activity ?? [];

  if (!active) {
    return (
      <div className="rounded-3xl border border-border bg-gradient-to-br from-brand/10 via-card to-card p-10 text-center shadow-card animate-fade-up">
        <Sparkles className="mx-auto h-8 w-8 text-brand" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
          Welcome to Stickmax Studio
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your production command center. Pick a documentary idea below to start
          building, and this dashboard will show every stage happening live.
        </p>
      </div>
    );
  }

  function continueWorking() {
    if (activeId) setSelectedTopicId(activeId);
    const dest = next ? STAGE_ROUTE[next] : "/export";
    router.navigate({ to: dest });
  }

  return (
    <div className="space-y-5">
      {/* Welcome + hero progress */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand/12 via-card to-card p-6 shadow-card animate-fade-up md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {greeting()} — Production Command Center
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
                {active.topic}
              </h1>
              <div className="mt-1 text-sm text-muted-foreground">{active.universe}</div>
            </div>
            <AIStatusBadge running={running} provider={activeProviderName} />
          </div>

          <div className="mt-6 flex items-end justify-between">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                AI Production Progress
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <AnimatedNumber
                  value={percent}
                  className="text-4xl font-bold tracking-tight md:text-5xl"
                  format={(n) => `${Math.round(n)}%`}
                />
                <span className="text-sm text-muted-foreground">
                  {doneStages}/{PIPELINE.length} stages
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Remaining Time
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {remainingMs > 0 ? fmtDuration(remainingMs) : "—"}
              </div>
            </div>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${percent}%` }}
            />
          </div>
          {running && <IndeterminateBar className="mt-2" />}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={continueWorking} className="btn-press">
              {next ? (
                <>
                  <Play className="mr-1.5 h-4 w-4" /> Continue Working
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-4 w-4" /> Go to Export
                </>
              )}
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gauge className="h-4 w-4 text-brand" />
              Current Stage:{" "}
              <span className="font-medium text-foreground">
                {currentStageDef ? currentStageDef.label : "Complete"}
              </span>
            </div>
          </div>
        </div>

        {/* Right rail stat stack */}
        <div className="grid gap-5">
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="Credit Saver Mode"
            value={credit.label}
            hint={`Batch ${credit.defaultImageBatch} · ${credit.dnaReferences} refs`}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="AI Provider"
            value={activeProviderName ? "Gemini Active" : "Built-in AI"}
            hint={activeProviderName ? "External provider connected" : "Lovable AI Gateway"}
            accent={!!activeProviderName}
          />
          <StatCard
            icon={<Download className="h-4 w-4" />}
            label="Export Status"
            value={`${exportReady}/5 ready`}
            hint={exportReady === 5 ? "Ready to export" : "Assets pending"}
          />
        </div>
      </div>

      {/* Pipeline overview */}
      <Reveal className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <SectionTitle icon={<ListVideo className="h-4 w-4" />} title="Pipeline Overview" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {PIPELINE.map((s) => {
            const done = activeId ? stageDone(activeId, s.key) : false;
            const isCurrent = s.key === currentStageKey && !done;
            return (
              <Link
                key={s.key}
                to={STAGE_ROUTE[s.key]}
                onClick={() => activeId && setSelectedTopicId(activeId)}
                className={`group flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all duration-200 hover:-translate-y-0.5 ${
                  isCurrent
                    ? "border-brand/50 bg-brand/10"
                    : done
                      ? "border-border bg-muted/40"
                      : "border-border bg-card"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-brand" />
                ) : isCurrent ? (
                  <CircleDot className="h-5 w-5 animate-pulse text-brand" />
                ) : (
                  <CircleDot className="h-5 w-5 text-muted-foreground/50" />
                )}
                <span className="text-xs font-medium">{s.label}</span>
              </Link>
            );
          })}
        </div>
      </Reveal>

      {/* Previews + activity + recent */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal className="rounded-3xl border border-border bg-card p-5 shadow-card" delay={40}>
          <SectionTitle icon={<ImageIcon className="h-4 w-4" />} title="Live Image Preview" />
          <PreviewFrame src={sceneImg} fallback="No storyboard images yet" to="/visual" activeId={activeId} />
        </Reveal>
        <Reveal className="rounded-3xl border border-border bg-card p-5 shadow-card" delay={80}>
          <SectionTitle icon={<ImagePlus className="h-4 w-4" />} title="Thumbnail Preview" />
          <PreviewFrame src={thumbImg} fallback="No thumbnail generated yet" to="/thumbnail" activeId={activeId} wide />
        </Reveal>
        <Reveal className="rounded-3xl border border-border bg-card p-5 shadow-card" delay={120}>
          <SectionTitle icon={<Mic className="h-4 w-4" />} title="Voice Preview" />
          <div className="mt-3 flex h-[150px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
            {hasVoice ? (
              <>
                <WaveBars bars={9} />
                <span className="text-xs text-muted-foreground">Voiceover generated</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No voiceover yet</span>
            )}
            <Link
              to="/voice"
              onClick={() => activeId && setSelectedTopicId(activeId)}
              className="text-xs font-medium text-brand hover:underline"
            >
              Open Voice Studio →
            </Link>
          </div>
        </Reveal>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Activity feed */}
        <Reveal className="rounded-3xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <SectionTitle icon={<Activity className="h-4 w-4" />} title="Activity Feed" />
          <div className="mt-3 space-y-2">
            {activity.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No activity yet. Start a stage to see live updates here.
              </p>
            )}
            {activity.slice(0, 8).map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.level === "error"
                      ? "bg-destructive"
                      : a.level === "success"
                        ? "bg-brand"
                        : "bg-muted-foreground/50"
                  }`}
                />
                <span className="min-w-0 flex-1 text-foreground/90">{a.msg}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Statistics */}
        <Reveal className="rounded-3xl border border-border bg-card p-5 shadow-card" delay={40}>
          <SectionTitle icon={<Gauge className="h-4 w-4" />} title="Statistics" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Projects" value={topics.length} />
            <MiniStat label="Stages Done" value={doneStages} />
            <MiniStat label="Progress" value={percent} suffix="%" />
            <MiniStat label="Assets Ready" value={exportReady} />
          </div>
        </Reveal>
      </div>

      {/* Recent projects */}
      <Reveal className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <SectionTitle icon={<FolderPlus className="h-4 w-4" />} title="Recent Projects" />
          <Link to="/topics" className="text-xs font-medium text-brand hover:underline">
            View all →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.slice(0, 6).map((t) => {
            const p = completionPercent(t.id);
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTopicId(t.id);
                  toast.success("Active project switched");
                }}
                className={`card-lift flex flex-col rounded-2xl border p-4 text-left ${
                  t.id === activeId ? "border-brand/50 bg-brand/5" : "border-border bg-card"
                }`}
              >
                <div className="line-clamp-2 text-sm font-semibold">{t.topic}</div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{p}% complete</span>
                  {t.id === activeId && <span className="font-medium text-brand">Active</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

function AIStatusBadge({ running, provider }: { running: boolean; provider: string | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        running
          ? "border-brand/40 bg-brand/10 text-brand"
          : "border-green-600/30 bg-green-600/10 text-green-600"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-brand" : "bg-green-600"}`}
      />
      {running ? "AI Working…" : provider ? "Gemini Active" : "AI Ready"}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card-lift rounded-3xl border border-border bg-card p-5 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${accent ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-lg font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="text-brand">{icon}</span>
      {title}
    </div>
  );
}

function MiniStat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-baseline gap-0.5">
        <AnimatedNumber value={value} className="text-2xl font-bold tracking-tight" />
        {suffix && <span className="text-sm font-semibold text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function PreviewFrame({
  src,
  fallback,
  to,
  activeId,
  wide,
}: {
  src: string | null;
  fallback: string;
  to: string;
  activeId: string | null;
  wide?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={() => activeId && setSelectedTopicId(activeId)}
      className="mt-3 block overflow-hidden rounded-2xl border border-border"
    >
      {src ? (
        <img
          src={src}
          alt="preview"
          className={`w-full object-cover transition-transform duration-500 hover:scale-[1.03] ${wide ? "aspect-video" : "h-[150px]"}`}
        />
      ) : (
        <div className={`flex items-center justify-center bg-muted/30 text-xs text-muted-foreground ${wide ? "aspect-video" : "h-[150px]"}`}>
          {fallback}
        </div>
      )}
    </Link>
  );
}
