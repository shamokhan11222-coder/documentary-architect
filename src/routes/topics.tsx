import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Star, Trash2, Search as SearchIcon, CheckCircle2, Zap, Loader2, Copy, Archive, Pencil } from "lucide-react";

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
  clearArchivedTopics,
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
import { putImage } from "@/lib/images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Score, Meta } from "@/components/Score";
import { StatusBadge } from "@/components/StatusBadge";
import { downloadJson, slugify } from "@/lib/io";
import type { Research, Story, ThumbnailIdea, VisualScene, Topic } from "@/lib/types";

export const Route = createFileRoute("/topics")({
  head: () => ({ meta: [{ title: "Projects — Stickmax Studio" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const router = useRouter();
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [autoId, setAutoId] = useState<string | null>(null);
  const [autoStep, setAutoStep] = useState("");

  const doResearch = useServerFn(researchTopic);
  const doStory = useServerFn(generateStory);
  const doVisual = useServerFn(generateVisualMap);
  const doThumbs = useServerFn(generateThumbnails);
  const doSeo = useServerFn(generateSeo);
  const doRate = useServerFn(rateVideo);

  function openProject(t: Topic) {
    setSelectedTopicId(t.id);
    router.navigate({ to: "/research" });
  }

  async function autoGenerate(t: Topic) {
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
        } catch {
          /* skip a failed scene */
        }
      }

      setAutoStep("Designing thumbnails…");
      const ideas = (await doThumbs({ data: { topic: t.topic, script: story.script, angle: research.storyAngles?.[0] } })) as ThumbnailIdea[];
      saveThumbnails({ topicId: t.id, ideas, generatedAt: Date.now() });
      for (let i = 0; i < ideas.length; i++) {
        setAutoStep(`Rendering thumbnails… ${i + 1}/${ideas.length}`);
        try {
          const url = await generateThumbnailImage(ideas[i]);
          await putImage(`thumb:${t.id}:${i}`, url);
        } catch {
          /* skip */
        }
      }

      setAutoStep("Writing SEO…");
      const seo = await doSeo({ data: { topic: t.topic, script: story.script } });
      saveSeo({ ...seo, topicId: t.id, generatedAt: Date.now() });

      setAutoStep("Rating…");
      const rating = await doRate({ data: { topic: t.topic, script: story.script } });
      saveRating({ ...rating, topicId: t.id, generatedAt: Date.now() });

      toast.success("Full production generated 🎬");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-generation failed");
    } finally {
      setAutoId(null);
      setAutoStep("");
    }
  }

  const filtered = topics
    .filter((t) => (showArchived ? t.archived : !t.archived))
    .filter((t) => (favOnly ? t.favorite : true))
    .filter((t) => {
      const q = query.trim();
      if (!q) return true;
      const meta = (t.topic + " " + t.explanation + " " + t.universe).toLowerCase();
      return meta.includes(q.toLowerCase()) || searchProject(t.id, q);
    });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every documentary is a project. Add new ideas from the Home feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-44 pl-8"
            />
          </div>
          <Button
            size="sm"
            variant={favOnly ? "default" : "outline"}
            onClick={() => setFavOnly((v) => !v)}
          >
            <Star className="mr-1 h-4 w-4" /> Saved
          </Button>
          <Button
            size="sm"
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="mr-1 h-4 w-4" /> Archived
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm("Delete all archived (old/test) projects? This cannot be undone.")
              ) {
                clearArchivedTopics();
                toast.success("Cleared archived projects");
              }
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Clear archived
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No projects yet. Go to Home and generate one from the idea feed.
          </p>
        )}
        {filtered.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border p-4 ${
              t.id === selectedId ? "border-primary" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {t.topic}
                  {t.completed && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t.explanation}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const next =
                      typeof window !== "undefined"
                        ? window.prompt("Rename project", t.topic)
                        : null;
                    if (next && next.trim()) {
                      renameTopic(t.id, next);
                      toast.success("Project renamed");
                    }
                  }}
                  aria-label="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleFavorite(t.id)}
                  aria-label="Favorite"
                >
                  <Star
                    className={`h-4 w-4 ${t.favorite ? "fill-amber-500 text-amber-500" : ""}`}
                  />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteTopic(t.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Score label="CTR" value={t.ctrScore} />
              <Score label="Evergreen" value={t.evergreenScore} />
              <Score label="Originality" value={t.originalityScore} />
              <Meta label="Research" value={t.researchDifficulty} />
              <Meta label="Visual" value={t.visualDifficulty} />
              <Meta label="Length" value={t.estimatedLength} />
            </div>
            <ProjectProgress topicId={t.id} />
            {autoId === t.id && (
              <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {autoStep}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => autoGenerate(t)} disabled={!!autoId}>
                <Zap className="mr-1 h-4 w-4" /> Auto-Generate
              </Button>
              <Button size="sm" onClick={() => openProject(t)}>
                Open project →
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadJson(slugify(t.topic) + "-project", exportProject(t.id))
                }
              >
                Export project
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => markCompleted(t.id, !t.completed)}
              >
                {t.completed ? "Mark active" : "Mark completed"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const copy = duplicateTopic(t.id);
                  if (copy) toast.success("Project duplicated");
                }}
              >
                <Copy className="mr-1 h-4 w-4" /> Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  toggleArchived(t.id);
                  toast.success(t.archived ? "Unarchived" : "Archived");
                }}
              >
                <Archive className="mr-1 h-4 w-4" /> {t.archived ? "Unarchive" : "Archive"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectProgress({ topicId }: { topicId: string }) {
  const s = useProjectStatus(topicId);
  const items: [string, boolean][] = [
    ["Research", s.research],
    ["Story", s.story],
    ["Visuals", s.visual],
    ["Thumbnail", s.thumbnail],
    ["SEO", s.seo],
    ["Rating", s.rating],
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {items.map(([label, done]) => (
        <span key={label} className="inline-flex items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">{label}</span>
          <StatusBadge status={done ? "Completed" : "Not Started"} />
        </span>
      ))}
    </div>
  );
}
