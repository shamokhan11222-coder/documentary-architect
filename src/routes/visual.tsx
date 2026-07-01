import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { generateVisualMap, regenerateScene } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useVisualMap,
  saveVisualMap,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Meta } from "@/components/Score";
import type { VisualScene } from "@/lib/types";

export const Route = createFileRoute("/visual")({
  head: () => ({ meta: [{ title: "Visual — Documentary Studio" }] }),
  component: VisualPage,
});

function sceneToText(s: VisualScene): string {
  return [
    `Scene ${s.sceneNumber}`,
    `Voiceover: ${s.voiceoverLine}`,
    `Visual: ${s.visualDescription}`,
    `Main Subject: ${s.mainSubject}`,
    `Background: ${s.background}`,
    `Camera Shot: ${s.cameraShot}`,
    `Emotion: ${s.emotion}`,
    `Objects: ${(s.objectsNeeded ?? []).join(", ")}`,
    `Scene Type: ${s.sceneType}`,
    `Visual Difficulty: ${s.visualDifficulty}`,
    `Notes: ${s.notes}`,
  ].join("\n");
}

function VisualPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const map = useVisualMap(selectedId);

  const gen = useServerFn(generateVisualMap);
  const regen = useServerFn(regenerateScene);
  const [busy, setBusy] = useState<string | null>(null);
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

  function handleGenerate() {
    if (!selected || !story) return;
    return withBusy("gen", async () => {
      const scenes = (await gen({
        data: { topic: selected.topic, script: story.script },
      })) as VisualScene[];
      saveVisualMap({ topicId: selected.id, scenes, generatedAt: Date.now() });
      toast.success("Visual map generated");
    });
  }

  function handleRegenScene(scene: VisualScene) {
    if (!selected || !map) return;
    return withBusy(`scene-${scene.sceneNumber}`, async () => {
      const updated = (await regen({
        data: { topic: selected.topic, scene },
      })) as VisualScene;
      const scenes = map.scenes.map((s) =>
        s.sceneNumber === scene.sceneNumber ? { ...updated, sceneNumber: scene.sceneNumber } : s,
      );
      saveVisualMap({ ...map, scenes, generatedAt: Date.now() });
      toast.success(`Scene ${scene.sceneNumber} regenerated`);
    });
  }

  function updateScene(sceneNumber: number, patch: Partial<VisualScene>) {
    if (!map) return;
    const scenes = map.scenes.map((s) =>
      s.sceneNumber === sceneNumber ? { ...s, ...patch } : s,
    );
    saveVisualMap({ ...map, scenes });
  }

  function fullText(): string {
    if (!map || !selected) return "";
    return `VISUAL MAP — ${selected.topic}\n\n${map.scenes.map(sceneToText).join("\n\n")}`;
  }

  function handleCopy() {
    if (!map) return;
    navigator.clipboard.writeText(fullText());
    toast.success("Visual map copied");
  }

  function handleDownload() {
    if (!map || !selected) return;
    const blob = new Blob([fullText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-visual-map.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">Visual Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Break the final script into a visual beat map — one beat per image.
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
        <Button onClick={handleGenerate} disabled={!selected || !story || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {map ? "Regenerate Visual Map" : "Generate Visual Map"}
        </Button>
      </div>

      {selected && !story && (
        <p className="mt-3 text-xs text-amber-600">
          No script found for this topic yet. Run the Story Engine first.
        </p>
      )}

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">
          Select a topic to build a visual map.
        </p>
      )}

      {map && selected && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              Copy Visual Map
            </Button>
            <Button size="sm" onClick={handleDownload}>
              Download Visual Map
            </Button>
          </div>

          <div className="space-y-3">
            {map.scenes.map((s) => (
              <div key={s.sceneNumber} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Scene {s.sceneNumber}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing(editing === s.sceneNumber ? null : s.sceneNumber)
                      }
                    >
                      {editing === s.sceneNumber ? "Done" : "Edit Scene"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRegenScene(s)}
                      disabled={!!busy}
                    >
                      {busy === `scene-${s.sceneNumber}` && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Regenerate Scene
                    </Button>
                  </div>
                </div>

                <p className="mt-2 text-xs italic text-muted-foreground">
                  “{s.voiceoverLine}”
                </p>

                {editing === s.sceneNumber ? (
                  <div className="mt-3 grid gap-2">
                    {(
                      [
                        ["visualDescription", "Visual Description"],
                        ["mainSubject", "Main Subject"],
                        ["background", "Background"],
                        ["cameraShot", "Camera Shot"],
                        ["emotion", "Emotion"],
                        ["sceneType", "Scene Type"],
                        ["visualDifficulty", "Visual Difficulty"],
                        ["notes", "Notes"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={(s[field] as string) ?? ""}
                          onChange={(e) =>
                            updateScene(s.sceneNumber, { [field]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm">{s.visualDescription}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Meta label="Subject" value={s.mainSubject} />
                      <Meta label="Background" value={s.background} />
                      <Meta label="Shot" value={s.cameraShot} />
                      <Meta label="Emotion" value={s.emotion} />
                      <Meta label="Type" value={s.sceneType} />
                      <Meta label="Difficulty" value={s.visualDifficulty} />
                    </div>
                    {s.objectsNeeded?.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Objects: {s.objectsNeeded.join(", ")}
                      </p>
                    )}
                    {s.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">Notes: {s.notes}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}