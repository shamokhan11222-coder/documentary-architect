import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Star,
  Trash2,
  Search as SearchIcon,
  CheckCircle2,
  Zap,
  Loader2,
  Copy,
  Archive,
  Pencil,
  Play,
  MoreHorizontal,
  Clock,
  Cpu,
  Download,
  FolderKanban,
  SlidersHorizontal,
} from "lucide-react";

import {
  deleteTopic,
  toggleFavorite,
  useTopics,
  setSelectedTopicId,
  markCompleted,
  useProjectStatus,
  useSelectedTopicId,
  exportProject,
  saveResearch,
  saveStory,
  saveVisualMap,
  saveThumbnails,
  saveSeo,
  saveRating,
  toggleArchived,
  duplicateTopic,
  searchProject,
  renameTopic,
} from "@/lib/store";
import {
  researchTopic,
  generateStory,
  generateVisualMap,
  generateThumbnails,
  generateSeo,
  rateVideo,
} from "@/lib/ai.functions";
import { generateSceneImage, generateThumbnailImage } from "@/lib/generate-image";
import { putImage, useImage } from "@/lib/images";
import { spendCredits, canGenerate } from "@/lib/account";
import { useActiveProvider } from "@/lib/provider";
import { completionPercent, nextStage, type StageKey } from "@/lib/manager";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ShimmerBlock, Reveal } from "@/components/motion";
import { downloadJson, slugify } from "@/lib/io";
import type { Research, Story, ThumbnailIdea, VisualScene, Topic } from "@/lib/types";
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

type Filter = "all" | "active" | "completed" | "saved" | "archived";
type Sort = "recent" | "progress" | "name";

export const Route = createFileRoute("/topics")({
  head: () => ({ meta: [{ title: "Projects — Stickmax Studio" }] }),
  component: ProjectsPage,
});

function timeAgo(ts?: number) {
  if (!ts) return "just now";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ProjectsPage() {
  const router = useRouter();
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const provider = useActiveProvider();
  const modelName = provider?.name ? "Gemini" : "Lovable AI";

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [loading, setLoading] = useState(true);
  const [autoId, setAutoId] = useState<string | null>(null);
  const [autoStep, setAutoStep] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t);
  }, []);

  const doResearch = useServerFn(researchTopic);
  const doStory = useServerFn(generateStory);
  const doVisual = useServerFn(generateVisualMap);
  const doThumbs = useServerFn(generateThumbnails);
  const doSeo = useServerFn(generateSeo);
  const doRate = useServerFn(rateVideo);

  function continueProject(t: Topic) {
    setSelectedTopicId(t.id);
    const next = nextStage(t.id);
    router.navigate({ to: next ? STAGE_ROUTE[next] : "/export" });
  }

  async function autoGenerate(t: Topic) {
    if (!canGenerate()) {
      // Elegant upgrade popup instead of an abrupt redirect.
      window.dispatchEvent(new Event("open-credit-gate"));
      return;
    }
    setAutoId(t.id);
    setSelectedTopicId(t.id);
    try {
      setAutoStep("Researching…");
      const research = (await doResearch({ data: { topic: t.topic, explanation: t.explanation } })) as Omit<Research, "topicId" | "generatedAt">;
      const researchFull: Research = { ...research, topicId: t.id, generatedAt: Date.now() };
      saveResearch(researchFull);

      setAutoStep("Writing story…");
      const story = (await doStory({ data: { topic: t.topic, research: researchFull } })) as Omit<Story, "topicId" | "generatedAt">;
      saveStory({ ...story, topicId: t.id, generatedAt: Date.now() });

      setAutoStep("Building storyboard…");
      const scenes = (await doVisual({ data: { topic: t.topic, script: story.script } })) as VisualScene[];
      saveVisualMap({ topicId: t.id, scenes, generatedAt: Date.now() });

      for (let i = 0; i < scenes.length; i++) {
        setAutoStep(`Generating images… ${i + 1}/${scenes.length}`);
        try {
          const url = await generateSceneImage(scenes[i]);
          await putImage(`scene:${t.id}:${scenes[i].sceneNumber}`, url);
        } catch { /* skip */ }
      }

      setAutoStep("Designing thumbnails…");
      const ideas = (await doThumbs({ data: { topic: t.topic, script: story.script, angle: research.storyAngles?.[0] } })) as ThumbnailIdea[];
      saveThumbnails({ topicId: t.id, ideas, generatedAt: Date.now() });
      for (let i = 0; i < ideas.length; i++) {
        setAutoStep(`Rendering thumbnails… ${i + 1}/${ideas.length}`);
        try {
          const url = await generateThumbnailImage(ideas[i]);
          await putImage(`thumb:${t.id}:${i}`, url);
        } catch { /* skip */ }
      }

      setAutoStep("Writing SEO…");
      const seo = await doSeo({ data: { topic: t.topic, script: story.script } });
      saveSeo({ ...seo, topicId: t.id, generatedAt: Date.now() });

      setAutoStep("Rating…");
      const rating = await doRate({ data: { topic: t.topic, script: story.script } });
      saveRating({ ...rating, topicId: t.id, generatedAt: Date.now() });

      spendCredits(30, `Auto-generated: ${t.topic}`);
      toast.success("Full production generated 🎬");
    } catch (e) {
      toast.error(humanizeError(e, "Auto-generation failed"));
    } finally {
      setAutoId(null);
      setAutoStep("");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = topics.filter((t) => (filter === "archived" ? t.archived : !t.archived));
    if (filter === "saved") list = list.filter((t) => t.favorite);
    if (filter === "completed") list = list.filter((t) => t.completed || completionPercent(t.id) === 100);
    if (filter === "active") list = list.filter((t) => !t.completed && completionPercent(t.id) < 100);
    if (q) {
      list = list.filter((t) => {
        const meta = (t.topic + " " + t.explanation + " " + t.universe).toLowerCase();
        return meta.includes(q) || searchProject(t.id, q);
      });
    }
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.topic.localeCompare(b.topic);
      if (sort === "progress") return completionPercent(b.id) - completionPercent(a.id);
      return (b.savedAt ?? 0) - (a.savedAt ?? 0);
    });
    return list;
  }, [topics, query, filter, sort]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "saved", label: "Saved" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Projects</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {topics.filter((t) => !t.archived).length} documentaries in your studio
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-full rounded-xl border border-border/60 bg-card/50 py-2.5 pl-9 pr-3 text-sm transition-all duration-300 focus:border-brand/50 focus:bg-card focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,transparent)] focus:outline-none"
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl glass-card p-2 pl-3">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  filter === f.key
                    ? "bg-brand/12 text-brand shadow-[0_0_16px_-6px_color-mix(in_oklab,var(--brand)_70%,transparent)]"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pr-1">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="cursor-pointer rounded-lg border border-border/60 bg-card/50 px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand/40 focus:outline-none"
            >
              <option value="recent">Recently edited</option>
              <option value="progress">Most progress</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/12 text-brand">
              <FolderKanban className="h-7 w-7" />
            </span>
            <h3 className="text-lg font-semibold">No projects here yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate an idea from the Studio feed to start your first documentary project.
            </p>
            <Button onClick={() => router.navigate({ to: "/" })} className="mt-1">
              Go to Studio
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t, i) => (
              <ProjectCard
                key={t.id}
                t={t}
                index={i}
                active={t.id === selectedId}
                modelName={modelName}
                autoBusy={autoId === t.id}
                autoStep={autoStep}
                anyAuto={!!autoId}
                onContinue={() => continueProject(t)}
                onAuto={() => autoGenerate(t)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusOf(t: Topic): { label: string; cls: string } {
  const p = completionPercent(t.id);
  if (t.completed || p === 100) return { label: "Completed", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" };
  if (p === 0) return { label: "Draft", cls: "border-border bg-muted/50 text-muted-foreground" };
  return { label: "In Progress", cls: "border-brand/30 bg-brand/10 text-brand" };
}

function ProjectCard({
  t,
  index,
  active,
  modelName,
  autoBusy,
  autoStep,
  anyAuto,
  onContinue,
  onAuto,
}: {
  t: Topic;
  index: number;
  active: boolean;
  modelName: string;
  autoBusy: boolean;
  autoStep: string;
  anyAuto: boolean;
  onContinue: () => void;
  onAuto: () => void;
}) {
  const thumb = useImage(`thumb:${t.id}:0`);
  const scene = useImage(`scene:${t.id}:1`);
  const img = thumb ?? scene;
  const percent = completionPercent(t.id);
  const status = statusOf(t);
  const tags = [t.universe, t.researchDifficulty && `${t.researchDifficulty} research`, t.estimatedLength]
    .filter(Boolean)
    .slice(0, 3) as string[];

  return (
    <Reveal
      delay={Math.min(index, 8) * 40}
      className={`card-lift group flex flex-col overflow-hidden rounded-3xl glass-card transition-all duration-300 ${
        active ? "ring-1 ring-brand/40" : ""
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        {img ? (
          <img
            src={img}
            alt={t.topic}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/20 via-brand/5 to-transparent">
            <FolderKanban className="h-8 w-8 text-brand/50" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur ${status.cls}`}>
          {status.label === "Completed" && <CheckCircle2 className="h-3 w-3" />}
          {status.label}
        </span>
        <button
          onClick={() => toggleFavorite(t.id)}
          aria-label="Favorite"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-amber-500"
        >
          <Star className={`h-4 w-4 ${t.favorite ? "fill-amber-500 text-amber-500" : ""}`} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-1 text-base font-semibold tracking-tight">{t.topic}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.explanation}</p>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Progress</span>
            <span className="font-semibold tabular-nums">{percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Meta: last edited + model */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {timeAgo(t.savedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Cpu className="h-3.5 w-3.5" /> {modelName}
          </span>
        </div>

        {autoBusy && (
          <div className="mt-3 flex items-center gap-2 text-xs text-brand">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {autoStep}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" className="btn-press flex-1" onClick={onContinue}>
            <Play className="mr-1 h-4 w-4" /> Continue
          </Button>
          <Button size="sm" variant="outline" onClick={onAuto} disabled={anyAuto} aria-label="Auto-generate">
            <Zap className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  const copy = duplicateTopic(t.id);
                  if (copy) toast.success("Project duplicated");
                }}
              >
                <Copy className="h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const next = typeof window !== "undefined" ? window.prompt("Rename project", t.topic) : null;
                  if (next && next.trim()) {
                    renameTopic(t.id, next);
                    toast.success("Project renamed");
                  }
                }}
              >
                <Pencil className="h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => markCompleted(t.id, !t.completed)}>
                <CheckCircle2 className="h-4 w-4" /> {t.completed ? "Mark active" : "Mark completed"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadJson(slugify(t.topic) + "-project", exportProject(t.id))}>
                <Download className="h-4 w-4" /> Export
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  toggleArchived(t.id);
                  toast.success(t.archived ? "Unarchived" : "Archived");
                }}
              >
                <Archive className="h-4 w-4" /> {t.archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  deleteTopic(t.id);
                  toast.success("Project deleted");
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Reveal>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-3xl glass-card">
      <ShimmerBlock className="aspect-video w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <ShimmerBlock className="h-5 w-3/4 rounded-md" />
        <ShimmerBlock className="h-4 w-full rounded-md" />
        <div className="flex gap-1.5">
          <ShimmerBlock className="h-5 w-16 rounded-full" />
          <ShimmerBlock className="h-5 w-20 rounded-full" />
        </div>
        <ShimmerBlock className="h-1.5 w-full rounded-full" />
        <div className="mt-2 flex gap-2">
          <ShimmerBlock className="h-9 flex-1 rounded-md" />
          <ShimmerBlock className="h-9 w-9 rounded-md" />
          <ShimmerBlock className="h-9 w-9 rounded-md" />
        </div>
      </div>
    </div>
  );
}
