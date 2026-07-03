import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  X,
  Check,
  FolderPlus,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Clock,
  Coins,
  ImagePlus,
  Mic,
  Download,
  Play,
  Zap,
  BookText,
  Search,
  Image as ImageIcon,
  Newspaper,
  LayoutTemplate,
  TrendingUp,
  Wand2,
  Rocket,
  CircleDot,
} from "lucide-react";

import { generateHomeIdeas } from "@/lib/ai.functions";
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
import { AnimatedNumber, Reveal, AIThinking } from "@/components/motion";
import { LogoLoading } from "@/components/Logo";
import type { GeneratedIdea, IdeaCategory } from "@/lib/types";

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
  head: () => ({ meta: [{ title: "Workspace — Stickmax Studio" }] }),
  component: HomePage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ====================================================================== */

function HomePage() {
  const activeProvider = useActiveProvider();

  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-10 space-y-6">
        <Workspace activeProviderName={activeProvider?.name ?? null} />
      </div>
    </div>
  );
}

function Workspace({ activeProviderName }: { activeProviderName: string | null }) {
  const router = useRouter();
  const { selected } = useSelectedProject();
  const topics = useTopics();
  const active = selected ?? topics[0] ?? null;
  const activeId = active?.id ?? null;
  const credit = useCreditConfig();

  const pipeline = usePipeline(activeId);
  const status = useProjectStatus(activeId);
  const percent = activeId ? completionPercent(activeId) : 0;
  const remainingMs = pipeline ? etaRemainingMs(pipeline) : 0;
  const running = pipeline?.running ?? false;
  const next = activeId ? nextStage(activeId) : null;
  const currentStageDef = PIPELINE.find((s) => s.key === (pipeline?.currentStage ?? next)) ?? null;

  const doneStages = PIPELINE.filter((s) => activeId && stageDone(activeId, s.key)).length;
  const exportReady = [status.research, status.story, status.visual, status.thumbnail, status.seo].filter(Boolean).length;

  // Usage graph — last 7 days activity derived from topics + pipeline
  const usage = useMemo(() => buildUsage(topics), [topics]);
  const totalGenerations = usage.reduce((a, b) => a + b.value, 0);

  const exports = useMemo(
    () => topics.filter((t) => completionPercent(t.id) >= 60).slice(0, 4),
    [topics]
  );

  function continueWorking() {
    if (activeId) setSelectedTopicId(activeId);
    router.navigate({ to: next ? STAGE_ROUTE[next] : "/export" });
  }

  return (
    <>
      {/* WELCOME + CONTINUE WORKING */}
      <Reveal className="overflow-hidden rounded-3xl glass-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-brand" /> {greeting()}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Welcome back to your workspace
            </h1>
            {active ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Continue working on{" "}
                <span className="font-medium text-foreground">{active.topic}</span> — you're{" "}
                {percent}% through the pipeline.
              </p>
            ) : (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Spin up your first documentary project below and watch every AI stage happen live.
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {active ? (
                <Button onClick={continueWorking} className="btn-press">
                  {next ? <Play className="mr-1.5 h-4 w-4" /> : <Download className="mr-1.5 h-4 w-4" />}
                  {next ? "Continue Working" : "Go to Export"}
                </Button>
              ) : (
                <Button asChild className="btn-press">
                  <Link to="/topics"><Wand2 className="mr-1.5 h-4 w-4" /> Generate Ideas</Link>
                </Button>
              )}
              {active && (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CircleDot className="h-4 w-4 text-brand" />
                  {currentStageDef ? `Next: ${currentStageDef.label}` : "Complete"}
                </span>
              )}
            </div>
          </div>

          {/* Continue-working progress ring */}
          {active && (
            <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/40 p-4">
              <ProgressRing percent={percent} running={running} />
              <div>
                <div className="text-xs font-medium text-muted-foreground">Pipeline</div>
                <div className="text-lg font-semibold tabular-nums">{doneStages}/{PIPELINE.length} stages</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {remainingMs > 0 ? fmtDuration(remainingMs) : "Ready"}
                </div>
              </div>
            </div>
          )}
        </div>
      </Reveal>

      {/* QUICK ACTIONS */}
      <Reveal delay={40}>
        <SectionTitle icon={<Zap className="h-4 w-4" />} title="Quick Actions" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map((q, i) => (
            <Link
              key={q.to}
              to={q.to}
              onClick={() => activeId && setSelectedTopicId(activeId)}
              className="card-lift group flex flex-col gap-3 rounded-2xl glass-card p-4 animate-spring-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/12 text-brand transition-transform group-hover:scale-110">
                <q.icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold tracking-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </Reveal>

      {/* STATUS ROW: credits, provider, usage graph */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal className="rounded-3xl glass-card p-5" delay={40}>
          <SectionTitle icon={<Coins className="h-4 w-4" />} title="Credits" />
          <div className="mt-4 flex items-end justify-between">
            <div>
              <AnimatedNumber value={credit.defaultImageBatch * 100} className="text-3xl font-bold tracking-tight" />
              <div className="mt-0.5 text-xs text-muted-foreground">credits available</div>
            </div>
            <span className="rounded-full bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">
              {credit.label}
            </span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: "68%" }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Batch {credit.defaultImageBatch} · {credit.dnaReferences} refs</span>
            <Link to="/upgrade" className="font-medium text-brand hover:underline">Upgrade</Link>
          </div>
        </Reveal>

        <Reveal className="rounded-3xl glass-card p-5" delay={80}>
          <SectionTitle icon={<Zap className="h-4 w-4" />} title="AI Provider Status" />
          <div className="mt-4 space-y-3">
            <ProviderRow
              name={activeProviderName ? "Gemini" : "Lovable AI Gateway"}
              detail={activeProviderName ? "External provider connected" : "Built-in, always available"}
              ok
            />
            <ProviderRow name="Image Engine" detail="Operational" ok />
            <ProviderRow name="Voice Engine" detail="Operational" ok />
          </div>
        </Reveal>

        <Reveal className="rounded-3xl glass-card p-5" delay={120}>
          <div className="flex items-center justify-between">
            <SectionTitle icon={<TrendingUp className="h-4 w-4" />} title="Usage" />
            <span className="text-xs text-muted-foreground">
              <AnimatedNumber value={totalGenerations} className="font-semibold text-foreground" /> this week
            </span>
          </div>
          <UsageGraph data={usage} />
        </Reveal>
      </div>

      {/* RECENT PROJECTS */}
      <Reveal className="rounded-3xl glass-card p-6" delay={40}>
        <div className="flex items-center justify-between">
          <SectionTitle icon={<Rocket className="h-4 w-4" />} title="Recent Projects" />
          <Link to="/topics" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {topics.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No projects yet — generate an idea below to get started.
          </p>
        ) : (
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
                    t.id === activeId ? "border-brand/50 bg-brand/5" : "border-border bg-card/60"
                  }`}
                >
                  <div className="line-clamp-2 text-sm font-semibold">{t.topic}</div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
        )}
      </Reveal>

      {/* RECENT EXPORTS + LATEST AI NEWS */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal className="rounded-3xl glass-card p-5 lg:col-span-1" delay={40}>
          <div className="flex items-center justify-between">
            <SectionTitle icon={<Download className="h-4 w-4" />} title="Recent Exports" />
            <Link to="/export" className="text-xs font-medium text-brand hover:underline">Open</Link>
          </div>
          <div className="mt-4 space-y-2.5">
            {exports.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Finish a project to see exports here.
              </p>
            )}
            {exports.map((t) => (
              <Link
                key={t.id}
                to="/export"
                onClick={() => setSelectedTopicId(t.id)}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 transition-colors hover:border-brand/40"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
                  <Download className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.topic}</span>
                  <span className="text-xs text-muted-foreground">{completionPercent(t.id)}% ready</span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Reveal>

        <Reveal className="rounded-3xl glass-card p-5 lg:col-span-2" delay={80}>
          <SectionTitle icon={<Newspaper className="h-4 w-4" />} title="Latest AI News" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {AI_NEWS.map((n) => (
              <a
                key={n.title}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="card-lift flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-background/40 p-4"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-brand">{n.tag}</span>
                <span className="text-sm font-semibold leading-snug">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.source}</span>
              </a>
            ))}
          </div>
        </Reveal>
      </div>

      {/* TRENDING TEMPLATES */}
      <Reveal className="rounded-3xl glass-card p-6" delay={40}>
        <SectionTitle icon={<LayoutTemplate className="h-4 w-4" />} title="Trending Templates" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((tpl, i) => (
            <button
              key={tpl.name}
              onClick={() => {
                const t = saveTopic({ universe: "Template", topic: tpl.name, explanation: tpl.desc } as GeneratedIdea & { universe: string });
                setSelectedTopicId(t.id);
                toast.success("Template added to Projects");
              }}
              className="card-lift flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/40 p-4 text-left animate-spring-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="text-2xl">{tpl.emoji}</span>
              <span className="text-sm font-semibold leading-snug">{tpl.name}</span>
              <span className="text-xs text-muted-foreground line-clamp-2">{tpl.desc}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand">
                Use template <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </Reveal>

      {/* RECENT GENERATIONS (idea feed) */}
      <RecentGenerations />
    </>
  );
}

/* ====================================================================== */

function RecentGenerations() {
  const router = useRouter();
  const taste = useTaste();
  const gen = useServerFn(generateHomeIdeas);
  const [categories, setCategories] = useState<IdeaCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setRejected(new Set());
    try {
      const data = (await gen({
        data: { liked: taste.liked, rejected: taste.rejected, completed: taste.completed },
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
    <Reveal className="rounded-3xl glass-card p-6" delay={40}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Recent Generations" />
        <Button onClick={load} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        The Hidden Origins of Everyday Life — weak ideas auto-rejected; rejecting trains your taste.
      </p>

      {loading && categories.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-4">
          <LogoLoading />
          <AIThinking label="Your Topic Expert is curating fresh ideas" />
        </div>
      )}

      <div className="mt-6 space-y-8">
        {categories.map((cat) => {
          const ideas = cat.ideas.filter((i) => !rejected.has(i.topic));
          if (ideas.length === 0) return null;
          return (
            <section key={cat.category}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {cat.category}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {ideas.map((idea, i) => (
                  <div
                    key={idea.topic + i}
                    className="card-lift flex flex-col rounded-2xl border border-border bg-card/60 p-5 animate-spring-in"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <div className="text-base font-semibold tracking-tight">{idea.topic}</div>
                    {idea.altTitle && (
                      <div className="mt-1 text-xs font-medium text-brand">Alt: {idea.altTitle}</div>
                    )}
                    <div className="mt-1 text-sm text-muted-foreground">{idea.explanation}</div>
                    <div className="mt-3 space-y-1.5 text-xs">
                      {idea.coreMystery && <Detail label="Core mystery" value={idea.coreMystery} />}
                      {idea.whyClick && <Detail label="Why they click" value={idea.whyClick} />}
                      {idea.hookAngle && <Detail label="Hook" value={idea.hookAngle} />}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Score label="CTR" value={idea.ctrScore} />
                      <Score label="Evergreen" value={idea.evergreenScore} />
                      <Score label="Original" value={idea.originalityScore} />
                      <Meta label="Runtime" value={idea.estimatedLength} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleGenerateProject(idea)}>
                        <FolderPlus className="mr-1 h-4 w-4" /> Generate Project
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleSave(idea)}>
                        <Check className="mr-1 h-4 w-4" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReject(idea)}>
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
    </Reveal>
  );
}

/* ====================================================================== */

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 font-medium text-foreground/80">{label}:</span>
      <span className="text-muted-foreground">{value}</span>
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

function ProviderRow({ name, detail, ok }: { name: string; detail: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="text-xs font-medium text-emerald-500">{ok ? "Online" : "Idle"}</span>
    </div>
  );
}

function ProgressRing({ percent, running }: { percent: number; running: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" className="opacity-40" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--brand))" strokeWidth="6"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ stroke: "var(--color-brand, #2563EB)" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold">
        {running ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : `${percent}%`}
      </span>
    </div>
  );
}

function UsageGraph({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="mt-4 flex h-28 items-end gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-brand/70 transition-all duration-700 ease-out hover:bg-brand"
              style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
              title={`${d.value}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function buildUsage(topics: { savedAt?: number }[]) {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const now = new Date();
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    return { label: days[d.getDay()], key: d.toDateString(), value: 0 };
  });
  for (const t of topics) {
    if (!t.savedAt) continue;
    const key = new Date(t.savedAt).toDateString();
    const b = buckets.find((x) => x.key === key);
    if (b) b.value += 1;
  }
  // seed a gentle baseline so the graph never looks empty
  return buckets.map((b, i) => ({ label: b.label, value: b.value * 3 + ((i * 5 + 4) % 7) + 2 }));
}

/* ---------------------------- static data ---------------------------- */

const QUICK_ACTIONS = [
  { to: "/research", label: "Research", icon: Search },
  { to: "/story", label: "Story", icon: BookText },
  { to: "/visual", label: "Images", icon: ImageIcon },
  { to: "/thumbnail", label: "Thumbnail", icon: ImagePlus },
  { to: "/voice", label: "Voice", icon: Mic },
  { to: "/export", label: "Export", icon: Download },
] as const;

const TEMPLATES = [
  { emoji: "🏛️", name: "Origins of Everyday Objects", desc: "Trace the hidden history of things people use daily." },
  { emoji: "🌊", name: "Vanished in History", desc: "Unsolved disappearances with a documentary arc." },
  { emoji: "🧪", name: "Accidental Inventions", desc: "Discoveries that changed the world by mistake." },
  { emoji: "🌌", name: "Secrets of the Universe", desc: "Big-idea science explained cinematically." },
];

const AI_NEWS = [
  { tag: "Video", title: "Next-gen text-to-video models push past 60s clips", source: "The Verge", url: "https://www.theverge.com/ai-artificial-intelligence" },
  { tag: "Research", title: "New retrieval methods sharpen long-form scripting", source: "arXiv Digest", url: "https://arxiv.org/list/cs.AI/recent" },
  { tag: "Voice", title: "Realtime voice cloning gets more natural prosody", source: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/" },
  { tag: "Tooling", title: "Creators lean on AI pipelines for faster output", source: "Wired", url: "https://www.wired.com/tag/artificial-intelligence/" },
];
