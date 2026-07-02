import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, X, Check, FolderPlus } from "lucide-react";

import { generateHomeIdeas } from "@/lib/ai.functions";
import { LogoLoading } from "@/components/Logo";
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
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Documentary Ideas
            </h1>
            {activeProvider && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-600/30 bg-green-600/10 px-2.5 py-0.5 text-xs font-medium text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                Gemini Active
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
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
        <div className="mt-16 flex flex-col items-center gap-4">
          <LogoLoading />
          <p className="text-sm text-muted-foreground">
            Your Topic Expert is curating fresh ideas…
          </p>
        </div>
      )}

      <div className="mt-10 space-y-10">
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
