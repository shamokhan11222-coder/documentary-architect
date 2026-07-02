import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, X, Check, FolderPlus } from "lucide-react";

import { generateHomeIdeas } from "@/lib/ai.functions";
import {
  saveTopic,
  setSelectedTopicId,
  useTaste,
  addTaste,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { useActiveProvider } from "@/lib/provider";
import type { GeneratedIdea, IdeaCategory } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Home — Documentary Studio" }] }),
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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Documentary Ideas</h1>
            {activeProvider && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-600/30 bg-green-600/10 px-2 py-0.5 text-xs font-medium text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                Gemini Active
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The Hidden Origins of Everyday Life — engineered by a senior documentary
            strategist. Weak ideas are auto-rejected; rejecting trains your taste.
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
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Your Topic Expert is curating fresh ideas…
        </p>
      )}

      <div className="mt-6 space-y-8">
        {categories.map((cat) => {
          const ideas = cat.ideas.filter((i) => !rejected.has(i.topic));
          if (ideas.length === 0) return null;
          return (
            <section key={cat.category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {ideas.map((idea, i) => (
                  <div
                    key={idea.topic + i}
                    className="flex flex-col rounded-lg border border-border p-4"
                  >
                    <div className="font-medium">{idea.topic}</div>
                    {idea.altTitle && (
                      <div className="mt-0.5 text-xs text-primary">
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
