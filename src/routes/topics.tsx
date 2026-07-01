import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Star, Trash2, Search as SearchIcon, CheckCircle2 } from "lucide-react";

import {
  deleteTopic,
  toggleFavorite,
  useTopics,
  setSelectedTopicId,
  markCompleted,
  useProjectStatus,
  useSelectedTopicId,
  exportProject,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Score, Meta } from "@/components/Score";
import { StatusBadge } from "@/components/StatusBadge";
import { downloadJson, slugify } from "@/lib/io";
import type { Topic } from "@/lib/types";

export const Route = createFileRoute("/topics")({
  head: () => ({ meta: [{ title: "Projects — Documentary Studio" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const router = useRouter();
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  function openProject(t: Topic) {
    setSelectedTopicId(t.id);
    router.navigate({ to: "/research" });
  }

  const filtered = topics
    .filter((t) => (favOnly ? t.favorite : true))
    .filter((t) =>
      query.trim()
        ? (t.topic + " " + t.explanation + " " + t.universe)
            .toLowerCase()
            .includes(query.toLowerCase())
        : true,
    );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
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
            <div className="mt-3 flex flex-wrap gap-2">
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
    ["Prompts", s.prompts],
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
