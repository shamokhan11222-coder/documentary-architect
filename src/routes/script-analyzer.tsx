import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  analyzeScript,
  generateScriptFromPattern,
  type ScriptPattern,
} from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/io";
import { humanizeError } from "@/lib/humanize-error";

export const Route = createFileRoute("/script-analyzer")({
  head: () => ({ meta: [{ title: "Script Analyzer — Stickmax Studio" }] }),
  component: ScriptAnalyzerPage,
});

const PATTERN_FIELDS: { key: keyof ScriptPattern; label: string }[] = [
  { key: "hookStructure", label: "Hook structure" },
  { key: "pacing", label: "Pacing" },
  { key: "sectionFlow", label: "Section flow" },
  { key: "curiosityLoops", label: "Curiosity loops" },
  { key: "transitionStyle", label: "Transition style" },
  { key: "evidencePlacement", label: "Evidence placement" },
  { key: "endingStyle", label: "Ending style" },
  { key: "avgSentenceLength", label: "Average sentence length" },
  { key: "tone", label: "Tone" },
  { key: "storyRhythm", label: "Story rhythm" },
];

function ScriptAnalyzerPage() {
  const analyze = useServerFn(analyzeScript);
  const generate = useServerFn(generateScriptFromPattern);

  const [reference, setReference] = useState("");
  const [pattern, setPattern] = useState<ScriptPattern | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    script: string;
    originality: { score: number; verdict: string; notes: string[] };
  } | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const p = await analyze({ data: { script: reference } });
      setPattern(p);
      toast.success("Pattern extracted");
    } catch (e) {
      toast.error(humanizeError(e, "Analysis failed"));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate() {
    if (!pattern) return;
    setGenerating(true);
    try {
      const r = await generate({ data: { topic, pattern } });
      setResult(r);
      toast.success("Original script generated");
    } catch (e) {
      toast.error(humanizeError(e, "Generation failed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Script Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          Analyze a reference documentary script to extract its storytelling
          pattern, then generate an original script that reuses the structure —
          never the wording.
        </p>
      </div>

      {/* Reference input */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium">Reference script</div>
        <textarea
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Paste any reference documentary script here…"
          className="h-48 w-full resize-y rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Button onClick={handleAnalyze} disabled={analyzing}>
          {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Analyze Script
        </Button>
      </section>

      {/* Pattern summary */}
      {pattern && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Pattern Summary</div>
            <button
              onClick={() =>
                copyText(
                  PATTERN_FIELDS.map(
                    (f) => `${f.label}: ${pattern[f.key]}`,
                  ).join("\n"),
                  "Pattern copied",
                )
              }
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Copy pattern
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{pattern.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PATTERN_FIELDS.map((f) => (
              <div key={f.key} className="rounded-md border border-border p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {f.label}
                </div>
                <div className="mt-1 text-sm">{pattern[f.key]}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Generate from pattern */}
      {pattern && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">Generate from pattern</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a new topic…"
            className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <Button onClick={handleGenerate} disabled={generating || !topic.trim()}>
            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Script From Pattern
          </Button>
        </section>
      )}

      {/* Result */}
      {result && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Original script</div>
            <button
              onClick={() => copyText(result.script, "Script copied")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Copy Script
            </button>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Originality Check</span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs">
                {result.originality.score}/10
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.originality.verdict}
            </p>
            {result.originality.notes?.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {result.originality.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>

          <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm">
            {result.script}
          </pre>
        </section>
      )}
    </div>
  );
}
