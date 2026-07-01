import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Upload, Pencil, Trash2, ImagePlus } from "lucide-react";

import { generateVisualMap } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useVisualMap,
  saveVisualMap,
} from "@/lib/store";
import { useImage, putImage, deleteImage, fileToDataUrl } from "@/lib/images";
import { generateSceneImage } from "@/lib/generate-image";
import { Button } from "@/components/ui/button";
import { Steps } from "@/components/Steps";
import type { VisualScene } from "@/lib/types";

export const Route = createFileRoute("/visual")({
  head: () => ({ meta: [{ title: "Images — Documentary Studio" }] }),
  component: VisualPage,
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;

function VisualPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const map = useVisualMap(selectedId);

  const gen = useServerFn(generateVisualMap);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

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

  function handleBuildBoard() {
    if (!selected || !story) return;
    return withBusy("gen", async () => {
      const scenes = (await gen({
        data: { topic: selected.topic, script: story.script },
      })) as VisualScene[];
      saveVisualMap({ topicId: selected.id, scenes, generatedAt: Date.now() });
      toast.success("Storyboard built — now generate images");
    });
  }

  async function genImage(scene: VisualScene) {
    if (!selected) return;
    const dataUrl = await generateSceneImage(scene);
    await putImage(sceneImageId(selected.id, scene.sceneNumber), dataUrl);
  }

  function handleGenerateAll() {
    if (!selected || !map) return;
    return withBusy("all", async () => {
      const scenes = map.scenes;
      setProgress({ done: 0, total: scenes.length });
      for (let i = 0; i < scenes.length; i++) {
        try {
          await genImage(scenes[i]);
        } catch (e) {
          toast.error(`Scene ${scenes[i].sceneNumber}: ${e instanceof Error ? e.message : "failed"}`);
        }
        setProgress({ done: i + 1, total: scenes.length });
      }
      setProgress(null);
      toast.success("All images generated");
    });
  }

  function handleRegenImage(scene: VisualScene) {
    return withBusy(`img-${scene.sceneNumber}`, async () => {
      await genImage(scene);
      toast.success(`Scene ${scene.sceneNumber} image regenerated`);
    });
  }

  async function handleReplace(scene: VisualScene, file: File | null) {
    if (!file || !selected) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      await putImage(sceneImageId(selected.id, scene.sceneNumber), dataUrl);
      toast.success("Image replaced");
    } catch {
      toast.error("Could not load that image");
    }
  }

  function updateScene(sceneNumber: number, patch: Partial<VisualScene>) {
    if (!map) return;
    saveVisualMap({
      ...map,
      scenes: map.scenes.map((s) => (s.sceneNumber === sceneNumber ? { ...s, ...patch } : s)),
    });
  }

  function deleteScene(sceneNumber: number) {
    if (!map || !selected) return;
    deleteImage(sceneImageId(selected.id, sceneNumber));
    saveVisualMap({ ...map, scenes: map.scenes.filter((s) => s.sceneNumber !== sceneNumber) });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Steps current="visual" />
      <h1 className="text-xl font-semibold">Storyboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The AI turns your script into a storyboard and generates real images automatically, using
        your Visual DNA for consistency. You never touch prompts.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedTopicId(e.target.value || null)}
        >
          <option value="">Select a project…</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.topic}
            </option>
          ))}
        </select>
        <Button onClick={handleBuildBoard} disabled={!selected || !story || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {map ? "Rebuild Storyboard" : "Build Storyboard"}
        </Button>
        {map && (
          <Button variant="secondary" onClick={handleGenerateAll} disabled={!!busy}>
            {busy === "all" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <ImagePlus className="mr-2 h-4 w-4" /> Generate All Images
          </Button>
        )}
      </div>

      {progress && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">
            Generating images… {progress.done}/{progress.total}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {selected && !story && (
        <p className="mt-3 text-xs text-amber-600">
          No script found for this project yet. Run the Story Engine first.
        </p>
      )}

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">Select a project to build a storyboard.</p>
      )}

      {map && selected && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {map.scenes.map((s) => (
            <SceneCard
              key={s.sceneNumber}
              scene={s}
              topicId={selected.id}
              busy={busy}
              editing={editing === s.sceneNumber}
              onToggleEdit={() => setEditing(editing === s.sceneNumber ? null : s.sceneNumber)}
              onRegen={() => handleRegenImage(s)}
              onReplace={(f) => handleReplace(s, f)}
              onUpdate={(patch) => updateScene(s.sceneNumber, patch)}
              onDelete={() => deleteScene(s.sceneNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SceneCard({
  scene,
  topicId,
  busy,
  editing,
  onToggleEdit,
  onRegen,
  onReplace,
  onUpdate,
  onDelete,
}: {
  scene: VisualScene;
  topicId: string;
  busy: string | null;
  editing: boolean;
  onToggleEdit: () => void;
  onRegen: () => void;
  onReplace: (f: File | null) => void;
  onUpdate: (patch: Partial<VisualScene>) => void;
  onDelete: () => void;
}) {
  const img = useImage(sceneImageId(topicId, scene.sceneNumber));
  const inputId = `replace-${topicId}-${scene.sceneNumber}`;
  const generating = busy === `img-${scene.sceneNumber}`;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="relative flex aspect-video items-center justify-center bg-muted/30">
        {img ? (
          <img src={img} alt={`Scene ${scene.sceneNumber}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No image yet</span>
        )}
        {generating && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-xs font-medium">
          Scene {scene.sceneNumber}
        </span>
      </div>
      <div className="p-3">
        {editing ? (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Voiceover</label>
            <textarea
              className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={scene.voiceoverLine}
              onChange={(e) => onUpdate({ voiceoverLine: e.target.value })}
            />
            <label className="text-xs text-muted-foreground">Scene description</label>
            <textarea
              className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={scene.visualDescription}
              onChange={(e) => onUpdate({ visualDescription: e.target.value })}
            />
          </div>
        ) : (
          <>
            <p className="text-xs italic text-muted-foreground">“{scene.voiceoverLine}”</p>
            <p className="mt-1 text-sm">{scene.visualDescription}</p>
          </>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={onRegen} disabled={!!busy}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
          </Button>
          <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => onReplace(e.target.files?.[0] ?? null)} />
          <label htmlFor={inputId}>
            <Button asChild size="sm" variant="ghost">
              <span>
                <Upload className="mr-1 h-3.5 w-3.5" /> Replace
              </span>
            </Button>
          </label>
          <Button size="sm" variant="ghost" onClick={onToggleEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> {editing ? "Done" : "Edit"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
