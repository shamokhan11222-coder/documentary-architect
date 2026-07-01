import { createFileRoute } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Star, Trash2, Search as SearchIcon, Loader2 } from "lucide-react";

import { generateTopics } from "@/lib/ai.functions";
import {
  saveTopic,
  deleteTopic,
  toggleFavorite,
  useTopics,
  setSelectedTopicId,
} from "@/lib/store";
import { useSettings, useSaveSettings } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Score, Meta } from "@/components/Score";
import { Steps } from "@/components/Steps";
import { StatusBadge } from "@/components/StatusBadge";
import { useProjectStatus, useSelectedTopicId, exportProject } from "@/lib/store";
import { downloadJson, slugify } from "@/lib/io";
import type { Topic } from "@/lib/types";

export const Route = createFileRoute("/topics")({
  head: () => ({ meta: [{ title: "Topics — Documentary Studio" }] }),
  component: TopicsPage,
});

interface Generated {
  topic: string;
  explanation: string;
  ctrScore: number;
  evergreenScore: number;
  originalityScore: number;
  researchDifficulty: string;
  visualDifficulty: string;
  estimatedLength: string;
}

function TopicsPage() {
  const router = useRouter();
  const settings = useSettings();
  const saveSettings = useSaveSettings();
  const topics = useTopics();
  const gen = useServerFn(generateTopics);
  const selectedId = useSelectedTopicId();

  const [universe, setUniverse] = useState(settings.lastUniverse);
  const [results, setResults] = useState<Generated[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  async function handleGenerate() {
    if (!universe.trim()) return;
    setLoading(true);
    setResults([]);
    saveSettings({ lastUniverse: universe.trim() });
    try {
      const data = (await gen({ data: { universe: universe.trim() } })) as Generated[];
      setResults(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate topics");
    } finally {
      setLoading(false);
    }
  }

  function handleSave(g: Generated) {
    saveTopic({ universe: universe.trim(), ...g });
    toast.success("Topic saved");
  }

  function goResearch(t: Topic) {
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
      <Steps current="topic" />
      <h1 className="text-xl font-semibold">Topic Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate documentary ideas from a universe / theme.
      </p>

      <div className="mt-4 flex gap-2">
        <Input
          value={universe}
          onChange={(e) => setUniverse(e.target.value)}
          placeholder='e.g. "The Hidden Origins of Everyday Life"'
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <Button onClick={handleGenerate} disabled={loading || !universe.trim()}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate
        </Button>
      </div>

      {results.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Generated ideas
          </h2>
          <div className="mt-2 space-y-3">
            {results.map((g, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{g.topic}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {g.explanation}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleSave(g)}>
                    Save
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Score label="CTR" value={g.ctrScore} />
                  <Score label="Evergreen" value={g.evergreenScore} />
                  <Score label="Originality" value={g.originalityScore} />
                  <Meta label="Research" value={g.researchDifficulty} />
                  <Meta label="Visual" value={g.visualDifficulty} />
                  <Meta label="Length" value={g.estimatedLength} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Saved topics ({topics.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-9 w-48 pl-8"
              />
            </div>
            <Button
              size="sm"
              variant={favOnly ? "default" : "outline"}
              onClick={() => setFavOnly((v) => !v)}
            >
              <Star className="mr-1 h-4 w-4" /> Favorites
            </Button>
          </div>
        </div>

        <div className="mt-2 space-y-3">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No saved topics yet.</p>
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
                  <div className="font-medium">{t.topic}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {t.explanation}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.universe}</div>
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
                <Button size="sm" onClick={() => goResearch(t)}>
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
              </div>
            </div>
          ))}
        </div>
      </section>
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