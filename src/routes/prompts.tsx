import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { generatePrompts, regeneratePrompt } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useVisualMap,
  usePromptPack,
  savePromptPack,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import type { PromptItem } from "@/lib/types";

export const Route = createFileRoute("/prompts")({
  head: () => ({ meta: [{ title: "Prompts — Documentary Studio" }] }),
  component: PromptsPage,
});

function promptToText(p: PromptItem): string {
  return [
    `Scene ${p.sceneNumber}`,
    `Voiceover: ${p.voiceoverLine}`,
    `Prompt: ${p.imagePrompt}`,
    `Negative: ${p.negativePrompt}`,
    `Style Notes: ${p.styleNotes}`,
    `Consistency: ${p.consistencyNotes}`,
  ].join("\n");
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function PromptsPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const map = useVisualMap(selectedId);
  const pack = usePromptPack(selectedId);

  const gen = useServerFn(generatePrompts);
  const regen = useServerFn(regeneratePrompt);
  const [busy, setBusy] = useState<string | null>(null);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function handleGenerate() {
    if (!selected || !map) return;
    return withBusy("gen", async () => {
      const prompts = (await gen({
        data: { topic: selected.topic, scenes: map.scenes },
      })) as PromptItem[];
      savePromptPack({ topicId: selected.id, prompts, generatedAt: Date.now() });
      toast.success("Prompts generated");
    });
  }

  function handleRegen(sceneNumber: number) {
    if (!selected || !map || !pack) return;
    const scene = map.scenes.find((s) => s.sceneNumber === sceneNumber);
    if (!scene) return;
    return withBusy(`p-${sceneNumber}`, async () => {
      const updated = (await regen({
        data: { topic: selected.topic, scene },
      })) as PromptItem;
      const prompts = pack.prompts.map((p) =>
        p.sceneNumber === sceneNumber ? { ...updated, sceneNumber } : p,
      );
      savePromptPack({ ...pack, prompts, generatedAt: Date.now() });
      toast.success(`Prompt ${sceneNumber} regenerated`);
    });
  }

  const allText = () =>
    !pack || !selected
      ? ""
      : `PROMPT PACK — ${selected.topic}\n\n${pack.prompts.map(promptToText).join("\n\n")}`;

  function handleCopyAll() {
    if (!pack) return;
    navigator.clipboard.writeText(allText());
    toast.success("All prompts copied");
  }

  function handleDownloadTxt() {
    if (!pack || !selected) return;
    download(slug(selected.topic) + "-prompts.txt", allText(), "text/plain");
  }

  function handleDownloadJson() {
    if (!pack) return;
    download(slug(selected!.topic) + "-prompts.json", JSON.stringify(pack.prompts, null, 2), "application/json");
  }

  function handleExportPack() {
    if (!pack || !selected) return;
    const payload = {
      topic: selected.topic,
      generatedAt: pack.generatedAt,
      globalStyleLock:
        "Simple MS Paint educational documentary style, flat colors, thick slightly rough black outlines, simple shapes, clean composition. No gradients, no shadows, no 3D, no realism, no cinematic lighting, no detailed textures, no text, no captions, no watermark, no frame.",
      characterStyleLock:
        "Simple bald stickman, round white head, thick black outline, dot eyes, simple mouth, thin black line body, no hair, no clothes unless needed, no shine on face, no grey face highlights.",
      prompts: pack.prompts,
    };
    download(slug(selected.topic) + "-prompt-pack.json", JSON.stringify(payload, null, 2), "application/json");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">Prompt Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn each visual scene into an image-generator prompt with a locked style.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedTopicId(e.target.value || null)}
        >
          <option value="">Select a saved topic…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.topic}
            </option>
          ))}
        </select>
        <Button onClick={handleGenerate} disabled={!selected || !map || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {pack ? "Regenerate Prompts" : "Generate Prompts"}
        </Button>
      </div>

      {selected && !map && (
        <p className="mt-3 text-xs text-amber-600">
          No visual map found for this topic yet. Run the Visual Engine first.
        </p>
      )}

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">
          Select a topic to generate prompts.
        </p>
      )}

      {pack && selected && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleCopyAll}>
              Copy All Prompts
            </Button>
            <Button size="sm" variant="secondary" onClick={handleDownloadTxt}>
              Download TXT
            </Button>
            <Button size="sm" variant="secondary" onClick={handleDownloadJson}>
              Download JSON
            </Button>
            <Button size="sm" onClick={handleExportPack}>
              Export Prompt Pack
            </Button>
          </div>

          <div className="space-y-3">
            {pack.prompts.map((p) => (
              <div key={p.sceneNumber} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Scene {p.sceneNumber}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(p.imagePrompt);
                        toast.success("Prompt copied");
                      }}
                    >
                      Copy Single Prompt
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRegen(p.sceneNumber)}
                      disabled={!!busy}
                    >
                      {busy === `p-${p.sceneNumber}` && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Regenerate Prompt
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs italic text-muted-foreground">
                  “{p.voiceoverLine}”
                </p>
                <p className="mt-2 text-sm">{p.imagePrompt}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Negative: {p.negativePrompt}
                </p>
                {p.styleNotes && (
                  <p className="mt-1 text-xs text-muted-foreground">Style: {p.styleNotes}</p>
                )}
                {p.consistencyNotes && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Consistency: {p.consistencyNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}