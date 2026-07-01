import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Play, RotateCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSelectedProject } from "@/components/ProjectPicker";
import { ProjectHeader } from "@/components/ProjectHeader";
import { PIPELINE, stageDone, nextStage, completionPercent, type StageKey } from "@/lib/manager";
import { getStyleProfile } from "@/lib/preferences";
import { getKnowledgeContext } from "@/lib/knowledge";
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
import {
  saveResearch,
  saveStory,
  saveVisualMap,
  saveThumbnails,
  saveSeo,
  saveRating,
  useProjectStatus,
} from "@/lib/store";
import type { Research, Story, ThumbnailIdea, VisualScene } from "@/lib/types";

export const Route = createFileRoute("/manager")({
  head: () => ({ meta: [{ title: "AI Manager — Documentary Studio" }] }),
  component: ManagerPage,
});

const RUN_KEY = "docos.manager.run";

function ManagerPage() {
  const { topics, selected, selectedId } = useSelectedProject();
  const status = useProjectStatus(selectedId);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");
  const [regen, setRegen] = useState(false);
  const cancelled = useRef(false);

  const doResearch = useServerFn(researchTopic);
  const doStory = useServerFn(generateStory);
  const doVisual = useServerFn(generateVisualMap);
  const doThumbs = useServerFn(generateThumbnails);
  const doSeo = useServerFn(generateSeo);
  const doRate = useServerFn(rateVideo);

  // Resume awareness: if a run was interrupted, note it.
  const [resumeFrom, setResumeFrom] = useState<StageKey | null>(null);
  useEffect(() => {
    if (!selectedId) return setResumeFrom(null);
    setResumeFrom(nextStage(selectedId));
  }, [selectedId, status]);

  async function runPipeline() {
    if (!selected) return;
    const t = selected;
    cancelled.current = false;
    setRunning(true);
    localStorage.setItem(RUN_KEY, t.id);
    try {
      const should = (s: StageKey) => regen || !stageDone(t.id, s);

      // Research
      let research: Research | null = null;
      if (should("research")) {
        setStep("Research Expert → researching…");
        const r = (await doResearch({ data: { topic: t.topic, explanation: t.explanation } })) as Omit<Research, "topicId" | "generatedAt">;
        research = { ...r, topicId: t.id, generatedAt: Date.now() };
        saveResearch(research);
      }
      if (cancelled.current) return;

      // Story (needs research)
      let story: Story | null = null;
      if (should("story")) {
        setStep("Story Architect → writing script…");
        const s = (await doStory({ data: { topic: t.topic, research: research ?? undefined } })) as Omit<Story, "topicId" | "generatedAt">;
        story = { ...s, topicId: t.id, generatedAt: Date.now() };
        saveStory(story);
      }
      if (cancelled.current) return;

      // Storyboard + Images
      let scenes: VisualScene[] = [];
      if (should("storyboard") && story) {
        setStep("Visual Director → building storyboard…");
        scenes = (await doVisual({ data: { topic: t.topic, script: story.script } })) as VisualScene[];
        saveVisualMap({ topicId: t.id, scenes, generatedAt: Date.now() });
      }
      if (should("images") && scenes.length) {
        for (let i = 0; i < scenes.length; i++) {
          if (cancelled.current) return;
          setStep(`Visual Director → images ${i + 1}/${scenes.length}…`);
          try {
            const url = await generateSceneImage(scenes[i]);
            await putImage(`scene:${t.id}:${scenes[i].sceneNumber}`, url);
          } catch {
            /* smart cache keeps prior progress; skip failures */
          }
        }
      }
      if (cancelled.current) return;

      // Thumbnail
      if (should("thumbnail") && story) {
        setStep("Thumbnail Designer → designing…");
        const ideas = (await doThumbs({ data: { topic: t.topic, script: story.script, angle: research?.storyAngles?.[0] } })) as ThumbnailIdea[];
        saveThumbnails({ topicId: t.id, ideas, generatedAt: Date.now() });
        for (let i = 0; i < ideas.length; i++) {
          if (cancelled.current) return;
          setStep(`Thumbnail Designer → rendering ${i + 1}/${ideas.length}…`);
          try {
            const url = await generateThumbnailImage(ideas[i]);
            await putImage(`thumb:${t.id}:${i}`, url);
          } catch {
            /* skip */
          }
        }
      }
      if (cancelled.current) return;

      // SEO
      if (should("seo") && story) {
        setStep("SEO Specialist → metadata…");
        const seo = await doSeo({ data: { topic: t.topic, script: story.script } });
        saveSeo({ ...seo, topicId: t.id, generatedAt: Date.now() });
      }
      if (cancelled.current) return;

      // Rating
      if (should("rating") && story) {
        setStep("Quality Reviewer → rating…");
        const rating = await doRate({ data: { topic: t.topic, script: story.script } });
        saveRating({ ...rating, topicId: t.id, generatedAt: Date.now() });
      }

      toast.success("Production complete 🎬");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Manager run failed");
    } finally {
      localStorage.removeItem(RUN_KEY);
      setRunning(false);
      setStep("");
    }
  }

  const styleProfile = getStyleProfile();
  const pct = selectedId ? completionPercent(selectedId) : 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5" />
        <h1 className="text-xl font-semibold">AI Manager</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        The master AI coordinates every specialist, decides what to generate next,
        reuses completed work, and never advances weak output.
      </p>

      <div className="mt-5">
        <ProjectHeader topics={topics} selectedId={selectedId} />
      </div>

      {!selected ? (
        <p className="text-sm text-muted-foreground">Select a project to coordinate production.</p>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Production pipeline</div>
              <div className="text-xs text-muted-foreground">{pct}% complete</div>
            </div>
            <div className="mt-3 space-y-1.5">
              {PIPELINE.map((s) => {
                const done = stageDone(selected.id, s.key);
                const isNext = !running && resumeFrom === s.key;
                return (
                  <div
                    key={s.key}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                      isNext ? "border-primary" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-muted-foreground/40" />
                      )}
                      <span className={done ? "" : "text-muted-foreground"}>{s.label}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {done ? "cached" : isNext ? "next up" : s.expert}
                    </span>
                  </div>
                );
              })}
            </div>

            {running && (
              <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {step}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={runPipeline} disabled={running}>
                {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                {resumeFrom && !regen ? "Coordinate production" : "Run full production"}
              </Button>
              {running && (
                <Button variant="outline" onClick={() => (cancelled.current = true)}>
                  Stop
                </Button>
              )}
              <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={regen}
                  onChange={(e) => setRegen(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <RotateCw className="h-3.5 w-3.5" /> Regenerate anyway (ignore cache)
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Runs continue in the background while you browse other pages. Completed
              stages are cached and reused — closing and reopening resumes where it stopped.
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-medium">What the manager knows</div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {styleProfile || "No learned style yet. Use 👍 ❤️ 👎 across the studio to teach it."}
            </p>
            {getKnowledgeContext(["hook", "story", "thumbnail"]) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Knowledge base has proven winners the experts will emulate.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
