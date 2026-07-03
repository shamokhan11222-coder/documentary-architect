import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Download } from "lucide-react";

import { generateStory, rewriteSection, reviewStory, type SectionMode } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  useResearch,
  useStory,
  saveStory,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Score } from "@/components/Score";
import { StatusBadge } from "@/components/StatusBadge";
import { StageShell } from "@/components/StageShell";
import { copyText, downloadTxt, slugify } from "@/lib/io";
import { Feedback } from "@/components/Feedback";
import { buildInjection, getScriptPattern } from "@/lib/generation-context";
import type { Story, StorySection, StoryReview } from "@/lib/types";
import { estimateSeconds } from "@/lib/production";
import { humanizeError } from "@/lib/humanize-error";
import {
  LENGTH_PRESETS,
  DEFAULT_LENGTH_ID,
  getPreset,
  customPreset,
  type LengthPreset,
} from "@/lib/story-length";

export const Route = createFileRoute("/story")({
  head: () => ({ meta: [{ title: "Story — Stickmax Studio" }] }),
  component: StoryPage,
});

const MODES: { mode: SectionMode; label: string }[] = [
  { mode: "rewrite", label: "Rewrite" },
  { mode: "shorter", label: "Shorter" },
  { mode: "longer", label: "Longer" },
  { mode: "emotional", label: "More Emotional" },
  { mode: "cinematic", label: "More Cinematic" },
  { mode: "curiosity", label: "More Curiosity" },
];

function rebuildScript(sections: StorySection[]) {
  return sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n");
}

function fmtDur(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function StoryPage() {
  return <StoryPageInner />;
}

function StatBox({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className={`text-base font-semibold ${tone ?? "text-foreground"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ScriptStats({ story }: { story: Story }) {
  const bodyWords = (story.sections ?? [])
    .map((s) => (typeof s?.content === "string" ? s.content.match(/\S+/g) ?? [] : []).length)
    .reduce((a, b) => a + b, 0);
  const duration = estimateSeconds((story.sections ?? []).map((s) => s?.content ?? "").join(" "));
  const min = story.minWords ?? 0;
  const tooShort = min > 0 && bodyWords < min;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Script stats</div>
        {story.targetLabel && (
          <div className="text-xs text-muted-foreground">
            Target {story.targetLabel} · {min}–{story.maxWords} words
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <StatBox label="Word count" value={bodyWords} tone={tooShort ? "text-red-600" : "text-foreground"} />
        <StatBox label="Est. voice duration" value={fmtDur(duration)} />
        <StatBox label="Sections" value={story.sections.length} />
        <StatBox label="Curiosity" value={`${story.curiosityScore ?? "—"}/10`} />
        <StatBox label="Retention" value={`${story.retentionScore ?? "—"}/10`} />
        <StatBox label="Story" value={`${story.storyScore}/10`} />
      </div>
      {tooShort && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-600">
          ⚠ Script is too short for the selected length ({bodyWords} words, target {min}+). Regenerate
          or expand sections to reach the target range.
        </p>
      )}
    </div>
  );
}

function StoryPageInner() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const research = useResearch(selectedId);
  const story = useStory(selectedId);

  const gen = useServerFn(generateStory);
  const rewrite = useServerFn(rewriteSection);
  const deepReview = useServerFn(reviewStory);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<StoryReview | null>(null);
  const [lengthId, setLengthId] = useState<string>(DEFAULT_LENGTH_ID);
  const [customMinutes, setCustomMinutes] = useState<number>(10);

  const preset: LengthPreset =
    lengthId === "custom" ? customPreset(customMinutes) : getPreset(lengthId) ?? getPreset(DEFAULT_LENGTH_ID)!;

  async function runDeepReview() {
    if (!selected || !story) return;
    setBusy("review");
    try {
      const r = (await deepReview({ data: { topic: selected.topic, script: story.script } })) as StoryReview;
      setReview(r);
      toast.success("Story reviewed");
    } catch (e) {
      toast.error(humanizeError(e, "Failed"));
    } finally {
      setBusy(null);
    }
  }

  function handleGenerate() {
    if (!selected) return;
    setBusy("gen");
    (async () => {
      try {
        const data = (await gen({
          data: {
            topic: selected.topic,
            research: research ?? undefined,
            minWords: preset.minWords,
            maxWords: preset.maxWords,
            targetLabel: preset.label,
            scriptPattern: getScriptPattern() ?? undefined,
            ...buildInjection(["hook", "story", "instruction"]),
          },
        })) as Omit<Story, "topicId" | "generatedAt">;
        saveStory({ ...data, topicId: selected.id, generatedAt: Date.now() });
        toast.success("Script generated — reviewed by Story Architect");
      } catch (e) {
        toast.error(humanizeError(e, "Failed"));
      } finally {
        setBusy(null);
      }
    })();
  }

  async function applyMode(section: StorySection, mode: SectionMode) {
    if (!selected || !story) return;
    setBusy(section.key + mode);
    try {
      const { content } = await rewrite({
        data: {
          topic: selected.topic,
          sectionTitle: section.title,
          content: section.content,
          mode,
        },
      });
      const sections = story.sections.map((s) =>
        s.key === section.key ? { ...s, content } : s,
      );
      saveStory({ ...story, sections, script: rebuildScript(sections), generatedAt: Date.now() });
    } catch (e) {
      toast.error(humanizeError(e, "Failed"));
    } finally {
      setBusy(null);
    }
  }

  function editSection(section: StorySection, content: string) {
    if (!story) return;
    const sections = story.sections.map((s) =>
      s.key === section.key ? { ...s, content } : s,
    );
    saveStory({ ...story, sections, script: rebuildScript(sections) });
  }

  return (
    <StageShell stage="story" maxWidth="max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Story Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Story Architect script, split into editable sections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {story?.review && (
            <span className="flex items-center gap-1 text-xs">
              <StatusBadge status="Needs Review" /> {story.review.score}/10
            </span>
          )}
          <Button onClick={handleGenerate} disabled={!selected || !!busy}>
            {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {story ? "Regenerate" : "Generate script"}
          </Button>
        </div>
      </div>

      {selected && (
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground">Video length</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {LENGTH_PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={lengthId === p.id ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setLengthId(p.id)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={lengthId === "custom" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setLengthId("custom")}
            >
              Custom
            </Button>
            {lengthId === "custom" && (
              <span className="flex items-center gap-1 text-xs">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(Number(e.target.value) || 1)}
                  className="h-7 w-16 rounded-md border border-input bg-background px-2 text-sm"
                />
                minutes
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Target: {preset.label} · {preset.minWords}–{preset.maxWords} words
          </p>
        </div>
      )}

      {selected && !research && (
        <p className="mt-3 text-xs text-amber-600">
          No research found — run the Research Engine first for a grounded script.
        </p>
      )}
      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">
          Select a project above to generate a script.
        </p>
      )}

      {story && selected && (
        <div className="mt-6 space-y-4">
          <ScriptStats story={story} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Score label="Hook" value={story.hookScore} />
            <Score label="Story" value={story.storyScore} />
            <Score label="Engagement" value={story.engagementScore} />
            <Button size="sm" variant="secondary" onClick={() => copyText(story.script, "Full script copied")}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy All
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadTxt(slugify(selected.topic) + "-script", story.script)}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Download
            </Button>
            <Button size="sm" variant="outline" onClick={runDeepReview} disabled={!!busy}>
              {busy === "review" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Story Review
            </Button>
          </div>

          {review && (
            <div className="rounded-lg border border-border bg-card p-4 text-xs">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold">Story Review</span>
                <Score label="Score" value={review.score} />
              </div>
              <dl className="grid gap-1.5 sm:grid-cols-2">
                {([
                  ["Weak Hook", review.weakHook],
                  ["Slow Pacing", review.slowPacing],
                  ["Repeated Ideas", review.repeatedIdeas],
                  ["Weak Ending", review.weakEnding],
                  ["Central Conflict", review.centralConflict],
                  ["Low Curiosity", review.lowCuriosity],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted/50 p-2">
                    <dt className="font-medium text-foreground">{k}</dt>
                    <dd className="text-muted-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {review.suggestions?.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {review.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {story.review?.verdict && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <strong>Quality Reviewer:</strong> {story.review.verdict}
            </p>
          )}

          {story.sections.map((section) => (
            <section key={section.key} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{section.title}</h2>
                <div className="flex items-center gap-2">
                  <Feedback
                    kind={section.key === "hook" ? "hook" : "story"}
                    content={`${section.title}: ${section.content}`}
                    topicId={selected.id}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => copyText(section.content)}
                    aria-label="Copy section"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <textarea
                className="min-h-[100px] w-full resize-y rounded-md border border-input bg-background p-2 text-sm leading-relaxed"
                value={section.content}
                onChange={(e) => editSection(section, e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MODES.map((m) => (
                  <Button
                    key={m.mode}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!!busy}
                    onClick={() => applyMode(section, m.mode)}
                  >
                    {busy === section.key + m.mode && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )}
                    {m.label}
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </StageShell>
  );
}
