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
  ImagePlus,
  Mic,
  Download,
  Play,
  BookText,
  Search,
  Image as ImageIcon,
  Newspaper,
  LayoutTemplate,
  TrendingUp,
  Wand2,
  Rocket,
  Plus,
  FileText,
  Film,
  Users,
  GraduationCap,
  PlayCircle,
  Landmark,
  Compass,
  FlaskConical,
  Telescope,
} from "lucide-react";

import { generateHomeIdeas } from "@/lib/ai.functions";
import {
  saveTopic,
  setSelectedTopicId,
  useTaste,
  addTaste,
  useTopics,
  useAllStories,
  useAllVisuals,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { useSelectedProject } from "@/components/ProjectPicker";
import { nextStage, type StageKey } from "@/lib/manager";
import { loadImage } from "@/lib/images";
import { Reveal, AIThinking } from "@/components/motion";
import { LogoLoading } from "@/components/Logo";
import type { GeneratedIdea, IdeaCategory, Story, VisualMap } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";

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

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;

const HEADLINES = [
  "Create Stories Millions Will Watch.",
  "Your Next Viral Documentary Starts Here.",
  "Turn Curiosity Into Cinematic Stories.",
  "Craft the Documentary the World Remembers.",
  "Every Great Documentary Begins With One Idea.",
];

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
  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14 space-y-12 md:space-y-16">
        <Workspace />
      </div>
    </div>
  );
}

function Workspace() {
  const router = useRouter();
  const { selected } = useSelectedProject();
  const topics = useTopics();
  const stories = useAllStories();
  const visuals = useAllVisuals();
  const active = selected ?? topics[0] ?? null;
  const activeId = active?.id ?? null;
  const [query, setQuery] = useState("");

  // Time/date-dependent values must not run during SSR/first render — they
  // differ between server and client and cause a hydration crash. Compute
  // them only after mount, with deterministic fallbacks for the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const headline = mounted ? HEADLINES[new Date().getDay() % HEADLINES.length] : HEADLINES[0];
  const greetingText = mounted ? greeting() : "Welcome back";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.topic.toLowerCase().includes(q));
  }, [topics, query]);

  const exportable = useMemo(
    () => topics.filter((t) => stories[t.id] || visuals[t.id]).slice(0, 4),
    [topics, stories, visuals],
  );

  const recentScripts = useMemo(
    () =>
      Object.values(stories)
        .sort((a, b) => (b.generatedAt ?? 0) - (a.generatedAt ?? 0))
        .slice(0, 4),
    [stories],
  );

  function continueWorking() {
    if (!activeId) return;
    setSelectedTopicId(activeId);
    const next = nextStage(activeId);
    router.navigate({ to: next ? STAGE_ROUTE[next] : "/export" });
  }

  const titleFor = (id: string) => topics.find((t) => t.id === id)?.topic ?? "Untitled project";

  return (
    <>
      {/* HERO — greeting + inspirational headline + search */}
      <Reveal className="pt-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
          <Sparkles className="h-3.5 w-3.5" /> {greetingText}
        </div>
        <h1 className="mt-4 max-w-4xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
          {headline}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
          Turn a spark of curiosity into a cinematic documentary — research, script, visuals and voice, all in one studio.
        </p>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="group mt-8 flex max-w-2xl items-center gap-3 rounded-2xl glass-card px-5 py-4"
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-focus-within:text-brand" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your projects, ideas and scripts…"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Button asChild className="btn-press shrink-0">
            <Link to="/topics"><Wand2 className="mr-1.5 h-4 w-4" /> New Idea</Link>
          </Button>
        </form>
      </Reveal>

      {/* QUICK CREATE */}
      <Reveal delay={40}>
        <SectionHeader icon={<Plus className="h-4 w-4" />} title="Quick Create" subtitle="Jump straight into any part of the studio." />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_CREATE.map((q, i) => (
            <Link
              key={q.to}
              to={q.to}
              onClick={() => activeId && setSelectedTopicId(activeId)}
              className="card-lift group flex flex-col gap-4 rounded-3xl glass-card p-6 animate-spring-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/12 text-brand transition-transform group-hover:scale-110">
                <q.icon className="h-6 w-6" />
              </span>
              <span className="text-sm font-semibold tracking-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </Reveal>

      {/* CONTINUE LAST PROJECT */}
      <Reveal delay={40}>
        <SectionHeader icon={<Play className="h-4 w-4" />} title="Continue Last Project" />
        <div className="mt-6 overflow-hidden rounded-3xl glass-card p-8 md:p-10">
          {active ? (
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Pick up where you left off
                </div>
                <h3 className="mt-2 max-w-2xl font-display text-2xl font-bold leading-tight md:text-3xl">
                  {active.topic}
                </h3>
              </div>
              <Button onClick={continueWorking} size="lg" className="btn-press shrink-0">
                <Play className="mr-2 h-4 w-4" /> Continue Creating
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="min-w-0">
                <h3 className="font-display text-2xl font-bold md:text-3xl">Start your first documentary</h3>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Generate a fresh idea and Stickmax will help you build the whole story.
                </p>
              </div>
              <Button asChild size="lg" className="btn-press shrink-0">
                <Link to="/topics"><Wand2 className="mr-2 h-4 w-4" /> Generate Ideas</Link>
              </Button>
            </div>
          )}
        </div>
      </Reveal>

      {/* RECENT PROJECTS */}
      <Reveal delay={40}>
        <SectionHeader
          icon={<Rocket className="h-4 w-4" />}
          title="Recent Projects"
          action={<Link to="/topics" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}
        />
        {filtered.length === 0 ? (
          <EmptyCard>{query ? "No projects match your search." : "No projects yet — generate an idea below to begin."}</EmptyCard>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, 6).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTopicId(t.id);
                  toast.success("Active project switched");
                }}
                className={`card-lift flex flex-col gap-3 rounded-3xl glass-card p-6 text-left ${
                  t.id === activeId ? "ring-1 ring-brand/50" : ""
                }`}
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <Film className="h-5 w-5" />
                </span>
                <span className="line-clamp-2 text-base font-semibold leading-snug">{t.topic}</span>
                <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-brand">
                  {t.id === activeId ? "Active project" : "Open project"} <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        )}
      </Reveal>

      {/* TEMPLATES */}
      <Reveal delay={40}>
        <SectionHeader icon={<LayoutTemplate className="h-4 w-4" />} title="Templates" subtitle="Proven documentary formats to start from." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((tpl, i) => (
            <button
              key={tpl.name}
              onClick={() => {
                const t = saveTopic({
                  universe: "Template",
                  topic: tpl.name,
                  explanation: tpl.desc,
                  ctrScore: 8,
                  evergreenScore: 8,
                  originalityScore: 8,
                  researchDifficulty: "Medium",
                  visualDifficulty: "Medium",
                  estimatedLength: "12-18 min",
                });
                setSelectedTopicId(t.id);
                toast.success("Template added to Projects");
              }}
              className="card-lift flex flex-col gap-3 rounded-3xl glass-card p-6 text-left animate-spring-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/15">
                <tpl.icon className="h-6 w-6" />
              </span>
              <span className="text-base font-semibold leading-snug">{tpl.name}</span>
              <span className="text-sm text-muted-foreground line-clamp-2">{tpl.desc}</span>
              <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand">
                Use template <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </Reveal>

      {/* TRENDING DOCUMENTARY IDEAS */}
      <RecentGenerations />

      {/* LATEST AI FEATURES */}
      <Reveal delay={40}>
        <SectionHeader icon={<Newspaper className="h-4 w-4" />} title="Latest AI Features" subtitle="Fresh capabilities shaping the future of storytelling." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AI_NEWS.map((n) => (
            <a
              key={n.title}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="card-lift flex flex-col gap-2 rounded-3xl glass-card p-6"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-brand">{n.tag}</span>
              <span className="text-base font-semibold leading-snug">{n.title}</span>
              <span className="mt-auto text-xs text-muted-foreground">{n.source}</span>
            </a>
          ))}
        </div>
      </Reveal>

      {/* COMMUNITY PICKS */}
      <Reveal delay={40}>
        <SectionHeader icon={<Users className="h-4 w-4" />} title="Community Picks" subtitle="Loved by creators in the Stickmax community." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMMUNITY_PICKS.map((c) => (
            <div key={c.title} className="card-lift flex flex-col gap-3 rounded-3xl glass-card p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">{c.tag}</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-brand" /> {c.stat}
                </span>
              </div>
              <span className="text-base font-semibold leading-snug">{c.title}</span>
              <span className="text-sm text-muted-foreground">by {c.author}</span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* TUTORIAL VIDEOS */}
      <Reveal delay={40}>
        <SectionHeader icon={<GraduationCap className="h-4 w-4" />} title="Tutorial Videos" subtitle="Learn the workflow in minutes." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TUTORIALS.map((v) => (
            <a
              key={v.title}
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="card-lift group flex flex-col overflow-hidden rounded-3xl glass-card"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-brand/25 via-brand/10 to-transparent">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-background/70 text-brand backdrop-blur transition-transform group-hover:scale-110">
                  <PlayCircle className="h-7 w-7" />
                </span>
                <span className="absolute bottom-3 right-3 rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
                  {v.length}
                </span>
              </div>
              <div className="p-5">
                <span className="text-base font-semibold leading-snug">{v.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{v.desc}</span>
              </div>
            </a>
          ))}
        </div>
      </Reveal>

      {/* RECENT EXPORTS */}
      <Reveal delay={40}>
        <SectionHeader
          icon={<Download className="h-4 w-4" />}
          title="Recent Exports"
          action={<Link to="/export" className="text-sm font-medium text-brand hover:underline">Open exports</Link>}
        />
        {exportable.length === 0 ? (
          <EmptyCard>Your finished exports will appear here.</EmptyCard>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {exportable.map((t) => (
              <Link
                key={t.id}
                to="/export"
                onClick={() => setSelectedTopicId(t.id)}
                className="card-lift flex flex-col gap-3 rounded-3xl glass-card p-6"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <Download className="h-5 w-5" />
                </span>
                <span className="line-clamp-2 text-base font-semibold leading-snug">{t.topic}</span>
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand">
                  Open export <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Reveal>

      {/* RECENT IMAGES */}
      <RecentImages visuals={visuals} topics={topics} />

      {/* RECENT SCRIPTS */}
      <Reveal delay={40}>
        <SectionHeader
          icon={<FileText className="h-4 w-4" />}
          title="Recent Scripts"
          action={<Link to="/story" className="text-sm font-medium text-brand hover:underline">Open scripts</Link>}
        />
        {recentScripts.length === 0 ? (
          <EmptyCard>Scripts you generate will show up here.</EmptyCard>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {recentScripts.map((s) => (
              <Link
                key={s.topicId}
                to="/story"
                onClick={() => setSelectedTopicId(s.topicId)}
                className="card-lift flex flex-col gap-3 rounded-3xl glass-card p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="line-clamp-1 text-base font-semibold">{titleFor(s.topicId)}</span>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {(s.script || s.sections?.map((x) => x.content).join(" ") || "").slice(0, 220)}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand">
                  Open script <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Reveal>
    </>
  );
}

/* ---- Recent Images (reads real generated scene images from IndexedDB) ---- */
function RecentImages({ visuals, topics }: { visuals: Record<string, VisualMap>; topics: { id: string }[] }) {
  const [images, setImages] = useState<string[]>([]);

  const candidates = useMemo(() => {
    const ids: string[] = [];
    for (const t of topics) {
      const v = visuals[t.id];
      if (!v) continue;
      for (const scene of v.scenes) ids.push(sceneImageId(t.id, scene.sceneNumber));
    }
    return ids.slice(0, 40);
  }, [visuals, topics]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found: string[] = [];
      for (const id of candidates) {
        if (found.length >= 8) break;
        const url = await loadImage(id);
        if (url) found.push(url);
      }
      if (!cancelled) setImages(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  return (
    <Reveal delay={40}>
      <SectionHeader
        icon={<ImageIcon className="h-4 w-4" />}
        title="Recent Images"
        action={<Link to="/visual" className="text-sm font-medium text-brand hover:underline">Open studio</Link>}
      />
      {images.length === 0 ? (
        <EmptyCard>Generated visuals will appear here as a gallery.</EmptyCard>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((src, i) => (
            <Link
              key={i}
              to="/visual"
              className="card-lift group relative aspect-video overflow-hidden rounded-3xl glass-card"
            >
              <img src={src} alt="Recent generated scene" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </Link>
          ))}
        </div>
      )}
    </Reveal>
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
      toast.error(humanizeError(e, "Failed to load ideas"));
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
    <Reveal delay={40}>
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="Trending Documentary Ideas"
        subtitle="Fresh, high-potential stories curated for you — reject any to sharpen your taste."
        action={
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        }
      />

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

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand/12 text-brand">{icon}</span>
          <h2 className="font-display text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
        </div>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-3xl glass-card p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/* ---------------------------- static data ---------------------------- */

const QUICK_CREATE = [
  { to: "/topics", label: "New Project", icon: Wand2 },
  { to: "/research", label: "Research", icon: Search },
  { to: "/story", label: "Story", icon: BookText },
  { to: "/visual", label: "Images", icon: ImageIcon },
  { to: "/thumbnail", label: "Thumbnail", icon: ImagePlus },
  { to: "/voice", label: "Voice", icon: Mic },
] as const;

const TEMPLATES = [
  { icon: Landmark, name: "Origins of Everyday Objects", desc: "Trace the hidden history of things people use daily." },
  { icon: Compass, name: "Vanished in History", desc: "Unsolved disappearances with a documentary arc." },
  { icon: FlaskConical, name: "Accidental Inventions", desc: "Discoveries that changed the world by mistake." },
  { icon: Telescope, name: "Secrets of the Universe", desc: "Big-idea science explained cinematically." },
];

const AI_NEWS = [
  { tag: "Video", title: "Next-gen text-to-video models push past 60s clips", source: "The Verge", url: "https://www.theverge.com/ai-artificial-intelligence" },
  { tag: "Research", title: "New retrieval methods sharpen long-form scripting", source: "arXiv Digest", url: "https://arxiv.org/list/cs.AI/recent" },
  { tag: "Voice", title: "Realtime voice cloning gets more natural prosody", source: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/" },
  { tag: "Tooling", title: "Creators lean on AI pipelines for faster output", source: "Wired", url: "https://www.wired.com/tag/artificial-intelligence/" },
];

const COMMUNITY_PICKS = [
  { tag: "Trending", title: "The Secret History of the Paperclip", author: "Ava Lin", stat: "2.4M views" },
  { tag: "Editor's Pick", title: "Cities That Vanished Overnight", author: "Marcus Reed", stat: "1.1M views" },
  { tag: "Rising", title: "How Salt Built Civilizations", author: "Priya Nair", stat: "870K views" },
];

const TUTORIALS = [
  { title: "From Idea to Script in 10 Minutes", desc: "Take a topic all the way to a polished narration.", length: "10:24", url: "https://www.youtube.com/results?search_query=documentary+scriptwriting" },
  { title: "Designing Cinematic Storyboards", desc: "Turn scenes into a consistent visual language.", length: "8:12", url: "https://www.youtube.com/results?search_query=storyboarding+documentary" },
  { title: "Voiceovers That Keep Viewers Watching", desc: "Direct pacing, tone and emotion for retention.", length: "6:47", url: "https://www.youtube.com/results?search_query=documentary+voiceover" },
];
