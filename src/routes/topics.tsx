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
  Folder,
  FolderPlus,
  SlidersHorizontal,
  Sparkles,
  Activity,
  ArrowUpRight,
  FolderInput,
} from "lucide-react";

import {
  deleteTopic,
  toggleFavorite,
  useTopics,
  setSelectedTopicId,
  markCompleted,
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
  setTopicFolder,
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
import { getVisualInstructions } from "@/lib/visual-instructions";
import { buildInjection, getScriptPattern } from "@/lib/generation-context";
import { spendCredits, canGenerate } from "@/lib/account";
import { useActiveProvider } from "@/lib/provider";
import { completionPercent, nextStage, PIPELINE, type StageKey } from "@/lib/manager";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ShimmerBlock, Reveal } from "@/components/motion";
import { downloadJson, slugify } from "@/lib/io";
import type { Research, Story, ThumbnailIdea, VisualScene, Topic } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CreateProjectModal } from "@/components/CreateProjectModal";

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

const STAGE_LABEL: Record<StageKey, string> = Object.fromEntries(
  PIPELINE.map((s) => [s.key, s.label]),
) as Record<StageKey, string>;

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

const UNFILED = "__all__";
const FAVORITES = "__fav__";

function ProjectsPage() {
  const router = useRouter();
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const provider = useActiveProvider();
  const modelName = provider?.name ? "Gemini" : "Lovable AI";

  const [query, setQuery] = useState("");
  // Debounce the query used for filtering so typing stays responsive and the
  // expensive full-text project search only runs after the user pauses.
  const debouncedQuery = useDebouncedValue(query, 250);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [folder, setFolder] = useState<string>(UNFILED);
  const [loading, setLoading] = useState(true);
  const [autoId, setAutoId] = useState<string | null>(null);
  const [autoStep, setAutoStep] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    // Data is read synchronously from local storage, so keep this minimal — just
    // one frame to avoid an SSR/hydration flash. Navigation stays instant.
    const t = setTimeout(() => setLoading(false), 80);
    return () => clearTimeout(t);
  }, []);

  const doResearch = useServerFn(researchTopic);
  const doStory = useServerFn(generateStory);
  const doVisual = useServerFn(generateVisualMap);
  const doThumbs = useServerFn(generateThumbnails);
  const doSeo = useServerFn(generateSeo);
  const doRate = useServerFn(rateVideo);

  const active = useMemo(() => topics.filter((t) => !t.archived), [topics]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    active.forEach((t) => t.folder && set.add(t.folder));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [active]);

  const recent = useMemo(
    () => [...active].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)).slice(0, 4),
    [active],
  );

  function continueProject(t: Topic) {
    setSelectedTopicId(t.id);
    const next = nextStage(t.id);
    router.navigate({ to: next ? STAGE_ROUTE[next] : "/export" });
  }

  function moveToFolder(t: Topic) {
    const name =
      typeof window !== "undefined" ? window.prompt("Move to folder", t.folder ?? "") : null;
    if (name === null) return;
    setTopicFolder(t.id, name);
    toast.success(name.trim() ? `Moved to “${name.trim()}”` : "Removed from folder");
  }

  function newFolder() {
    const name = typeof window !== "undefined" ? window.prompt("New folder name") : null;
    if (name && name.trim()) setFolder(name.trim());
  }

  async function autoGenerate(t: Topic) {
    if (!canGenerate()) {
      window.dispatchEvent(new Event("open-credit-gate"));
      return;
    }
    setAutoId(t.id);
    setSelectedTopicId(t.id);
    try {
      setAutoStep("Researching…");
      const research = (await doResearch({
        data: { topic: t.topic, explanation: t.explanation, ...buildInjection(["story", "approvedTopic"]) },
      })) as Omit<Research, "topicId" | "generatedAt">;
      const researchFull: Research = { ...research, topicId: t.id, generatedAt: Date.now() };
      saveResearch(researchFull);

      setAutoStep("Writing story…");
      const story = (await doStory({
        data: {
          topic: t.topic,
          research: researchFull,
          scriptPattern: getScriptPattern() ?? undefined,
          ...buildInjection(["hook", "story", "instruction"]),
        },
      })) as Omit<Story, "topicId" | "generatedAt">;
      saveStory({ ...story, topicId: t.id, generatedAt: Date.now() });

      setAutoStep("Building storyboard…");
      const scenes = (await doVisual({
        data: { topic: t.topic, script: story.script, visualInstructions: getVisualInstructions() },
      })) as VisualScene[];
      saveVisualMap({ topicId: t.id, scenes, generatedAt: Date.now() });

      for (let i = 0; i < scenes.length; i++) {
        setAutoStep(`Generating images… ${i + 1}/${scenes.length}`);
        try {
          const url = await generateSceneImage(scenes[i]);
          await putImage(`scene:${t.id}:${scenes[i].sceneNumber}`, url);
        } catch { /* skip */ }
      }

      setAutoStep("Designing thumbnails…");
      const { ideas } = (await doThumbs({
        data: { topic: t.topic, script: story.script, angle: research.storyAngles?.[0], ...buildInjection(["thumbnail"]) },
      })) as { ideas: ThumbnailIdea[]; conceptProvider: string };
      saveThumbnails({ topicId: t.id, ideas, generatedAt: Date.now() });
      for (let i = 0; i < ideas.length; i++) {
        setAutoStep(`Rendering thumbnails… ${i + 1}/${ideas.length}`);
        try {
          const url = await generateThumbnailImage(ideas[i]);
          await putImage(`thumb:${t.id}:${i}`, url);
        } catch { /* skip */ }
      }

      setAutoStep("Writing SEO…");
      const seo = await doSeo({ data: { topic: t.topic, script: story.script, ...buildInjection(["seo"]) } });
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
    const q = debouncedQuery.trim().toLowerCase();
    let list = topics.filter((t) => (filter === "archived" ? t.archived : !t.archived));
    if (folder === FAVORITES) list = list.filter((t) => t.favorite);
    else if (folder !== UNFILED) list = list.filter((t) => t.folder === folder);
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
  }, [topics, debouncedQuery, filter, sort, folder]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "saved", label: "Saved" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-[86rem] px-6 py-8 md:px-10 md:py-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl tracking-tight md:text-4xl">Projects</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {active.length} documentaries · {folders.length} folders in your studio
            </p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div className="relative w-full sm:w-80">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, scripts, research…"
                className="w-full rounded-xl border border-border/60 bg-card/50 py-2.5 pl-10 pr-3 text-sm transition-all duration-300 focus:border-brand/50 focus:bg-card focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,transparent)] focus:outline-none"
              />
            </div>
            <Button className="shrink-0" onClick={() => setCreateOpen(true)}>
              <FolderPlus className="mr-2 h-4 w-4" /> New Project
            </Button>
          </div>
        </div>

        {/* Recent activity */}
        {!loading && recent.length > 0 && (
          <div className="mt-6 flex items-center gap-3 overflow-x-auto pb-1">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-brand" /> Recent
            </span>
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => continueProject(t)}
                className="group inline-flex shrink-0 items-center gap-2 rounded-full glass px-3 py-1.5 text-xs font-medium transition-all duration-300 hover:-translate-y-0.5 hover:text-brand"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand/12 text-brand">
                  <FolderKanban className="h-3 w-3" />
                </span>
                <span className="max-w-[13rem] truncate">{t.topic}</span>
                <span className="text-muted-foreground">{timeAgo(t.savedAt)}</span>
                <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* Folder rail */}
          <aside className="lg:w-56 lg:shrink-0">
            <div className="glass-card rounded-2xl p-2.5 lg:sticky lg:top-6">
              <FolderRow
                icon={<FolderKanban className="h-4 w-4" />}
                label="All Projects"
                count={active.length}
                active={folder === UNFILED}
                onClick={() => setFolder(UNFILED)}
              />
              <FolderRow
                icon={<Star className="h-4 w-4" />}
                label="Favorites"
                count={active.filter((t) => t.favorite).length}
                active={folder === FAVORITES}
                onClick={() => setFolder(FAVORITES)}
              />
              {folders.length > 0 && (
                <div className="my-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Folders
                </div>
              )}
              {folders.map((f) => (
                <FolderRow
                  key={f}
                  icon={<Folder className="h-4 w-4" />}
                  label={f}
                  count={active.filter((t) => t.folder === f).length}
                  active={folder === f}
                  onClick={() => setFolder(f)}
                />
              ))}
              <button
                onClick={newFolder}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <FolderPlus className="h-4 w-4" /> New folder
              </button>
            </div>
          </aside>

          {/* Main column */}
          <div className="min-w-0 flex-1">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl glass-card p-2 pl-3">
              <div className="flex flex-wrap items-center gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-300 ${
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
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : active.length === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-4 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <Sparkles className="h-8 w-8" />
                </span>
                <h3 className="text-2xl font-semibold tracking-tight">No projects yet</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Create your first AI documentary and Stickmax will guide you through
                  research, story, visuals, voice and more.
                </p>
                <Button size="lg" onClick={() => setCreateOpen(true)} className="mt-2">
                  <FolderPlus className="mr-2 h-4 w-4" /> Create Project
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-3 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <FolderKanban className="h-7 w-7" />
                </span>
                <h3 className="text-lg">No projects match</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try a different filter or search, or start a new documentary.
                </p>
                <Button onClick={() => setCreateOpen(true)} className="mt-1">
                  <FolderPlus className="mr-2 h-4 w-4" /> New Project
                </Button>
              </div>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((t, i) => (
                  <ProjectCard
                    key={t.id}
                    t={t}
                    index={i}
                    folders={folders}
                    active={t.id === selectedId}
                    modelName={modelName}
                    autoBusy={autoId === t.id}
                    autoStep={autoStep}
                    anyAuto={!!autoId}
                    onContinue={() => continueProject(t)}
                    onAuto={() => autoGenerate(t)}
                    onMove={() => moveToFolder(t)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <CreateProjectModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function FolderRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 ${
        active
          ? "bg-brand/12 text-brand shadow-[0_0_18px_-8px_color-mix(in_oklab,var(--brand)_80%,transparent)]"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      <span className={active ? "text-brand" : ""}>{icon}</span>
      <span className="truncate">{label}</span>
      <span
        className={`ml-auto rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
          active ? "bg-brand/15 text-brand" : "bg-muted/60 text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function statusOf(t: Topic): { label: string; cls: string } {
  const p = completionPercent(t.id);
  if (t.completed || p === 100) return { label: "Completed", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" };
  if (p === 0) return { label: "Draft", cls: "border-border bg-muted/50 text-muted-foreground" };
  return { label: "In Progress", cls: "border-brand/30 bg-brand/10 text-brand" };
}

function ProgressRing({ percent, size = 46 }: { percent: number; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <span
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-label={`${percent}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-brand transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ strokeDasharray: c, strokeDashoffset: offset }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">{percent}</span>
    </span>
  );
}

function ProjectCard({
  t,
  index,
  folders,
  active,
  modelName,
  autoBusy,
  autoStep,
  anyAuto,
  onContinue,
  onAuto,
  onMove,
}: {
  t: Topic;
  index: number;
  folders: string[];
  active: boolean;
  modelName: string;
  autoBusy: boolean;
  autoStep: string;
  anyAuto: boolean;
  onContinue: () => void;
  onAuto: () => void;
  onMove: () => void;
}) {
  const thumb = useImage(`thumb:${t.id}:0`);
  const scene = useImage(`scene:${t.id}:1`);
  const img = thumb ?? scene;
  const percent = completionPercent(t.id);
  const status = statusOf(t);
  const next = nextStage(t.id);
  const nextLabel = next ? STAGE_LABEL[next] : "Export";
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

        {/* Progress ring */}
        <span className="absolute right-3 top-3 rounded-full bg-background/60 p-0.5 backdrop-blur">
          <ProgressRing percent={percent} />
        </span>

        {t.folder && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
            <Folder className="h-3 w-3" /> {t.folder}
          </span>
        )}

        {/* Hover preview overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-3 bg-gradient-to-t from-background/95 via-background/60 to-transparent p-4 opacity-0 backdrop-blur-[2px] transition-all duration-300 group-hover:pointer-events-auto group-hover:opacity-100">
          <p className="line-clamp-3 text-xs leading-relaxed text-foreground/90">{t.explanation}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="btn-press flex-1" onClick={onContinue}>
              <Play className="mr-1 h-4 w-4" /> Continue · {nextLabel}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="bg-background/60"
              aria-label="Favorite"
              onClick={() => toggleFavorite(t.id)}
            >
              <Star className={`h-4 w-4 ${t.favorite ? "fill-amber-500 text-amber-500" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-1 text-base tracking-tight">{t.topic}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.explanation}</p>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>

        {/* Meta: last edited + model + next stage */}
        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {timeAgo(t.savedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Cpu className="h-3.5 w-3.5" /> {modelName}
          </span>
          <span className="inline-flex items-center gap-1 text-brand">
            <Sparkles className="h-3.5 w-3.5" /> {nextLabel}
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
            <DropdownMenuContent align="end" className="w-52">
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
              {folders.length > 0 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="h-4 w-4" /> Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f}
                        onClick={() => {
                          setTopicFolder(t.id, f);
                          toast.success(`Moved to “${f}”`);
                        }}
                      >
                        <Folder className="h-4 w-4" /> {f}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onMove}>
                      <FolderPlus className="h-4 w-4" /> New / custom…
                    </DropdownMenuItem>
                    {t.folder && (
                      <DropdownMenuItem
                        onClick={() => {
                          setTopicFolder(t.id, null);
                          toast.success("Removed from folder");
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Remove from folder
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem onClick={onMove}>
                  <FolderInput className="h-4 w-4" /> Move to folder
                </DropdownMenuItem>
              )}
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
        <div className="mt-2 flex gap-2">
          <ShimmerBlock className="h-9 flex-1 rounded-md" />
          <ShimmerBlock className="h-9 w-9 rounded-md" />
          <ShimmerBlock className="h-9 w-9 rounded-md" />
        </div>
      </div>
    </div>
  );
}
