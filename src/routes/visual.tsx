import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Upload, Trash2, ImagePlus, RotateCcw } from "lucide-react";

import { generateVisualMap, checkImageConsistency } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useVisualMap,
  saveVisualMap,
} from "@/lib/store";
import { useImage, putImage, deleteImage, fileToDataUrl, loadImage } from "@/lib/images";
import { generateSceneImage } from "@/lib/generate-image";
import { getVisualInstructions } from "@/lib/visual-instructions";
import { useCreditConfig } from "@/lib/credit-mode";
import { Button } from "@/components/ui/button";
import { StageShell } from "@/components/StageShell";
import type { VisualScene, ConsistencyReport } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";
import { hasUnlimitedAccess } from "@/lib/account";
import { StageErrorBoundary } from "@/components/StageErrorBoundary";

export const Route = createFileRoute("/visual")({
  head: () => ({ meta: [{ title: "Images — Stickmax Studio" }] }),
  component: () => (
    <StageErrorBoundary>
      <VisualPage />
    </StageErrorBoundary>
  ),
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;
const pad3 = (n: number) => String(n).padStart(3, "0");

/** A stored image only counts as "generated" if it's a real, non-empty
 *  data/http image URL. Empty strings or junk left over from a failed run
 *  must NOT be treated as done, or scenes get skipped forever. */
function isValidImage(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const v = url.trim();
  if (v.length < 16) return false;
  return v.startsWith("data:image") || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("blob:");
}

function VisualPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const map = useVisualMap(selectedId);

  // A story object can exist without a usable script. Only a non-empty string
  // script is valid — everything downstream (scene counting) depends on it.
  // Script may come from the Story page (saved story) OR a manually pasted
  // script for the selected project.
  const [pasted, setPasted] = useState("");
  const storyScript = typeof story?.script === "string" ? story.script : "";
  const scriptText = storyScript.trim().length > 0 ? storyScript : pasted;
  const hasValidScript = scriptText.trim().length > 0;

  // A visual map may exist without a valid scenes array (older/partial saves).
  // Always work off a guaranteed array so `.length`/`.filter` never crash.
  const scenes: VisualScene[] = Array.isArray(map?.scenes) ? map!.scenes : [];
  const hasMap = !!map && scenes.length > 0;

  // Refs let per-scene card callbacks stay referentially stable (so memoized
  // SceneCards don't re-render on every progress tick) while still reading the
  // latest selected project / storyboard.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const mapRef = useRef(map);
  mapRef.current = map;

  const gen = useServerFn(generateVisualMap);
  const doCheck = useServerFn(checkImageConsistency);
  const credit = useCreditConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  // Which scenes already have a generated image (smart cache — never redo these)
  // and which failed on the last run (for "Retry Failed Only").
  const [have, setHave] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const refreshHave = useCallback(async () => {
    if (!selected || !map || !Array.isArray(map.scenes)) {
      setHave(new Set());
      return;
    }
    const s = new Set<number>();
    for (const sc of map.scenes) {
      const img = await loadImage(sceneImageId(selected.id, sc.sceneNumber));
      if (isValidImage(img)) s.add(sc.sceneNumber);
    }
    setHave(s);
  }, [selected, map]);

  useEffect(() => {
    void refreshHave();
  }, [refreshHave]);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(humanizeError(e, "Something went wrong"));
    } finally {
      setBusy(null);
    }
  }

  function handleBuildBoard() {
    if (!selected || !hasValidScript) return;
    return withBusy("gen", async () => {
      // Derive a scene-count target from the actual script length so long
      // videos get many scenes (≈1 scene per sentence). A 9–11 min / ~1500
      // word script yields roughly 120–180 scenes.
      const words = (scriptText.match(/\S+/g) ?? []).length;
      const minScenes = Math.max(8, Math.round(words / 12));
      const maxScenes = Math.max(minScenes + 4, Math.round(words / 8));
      const scenes = (await gen({
        data: { topic: selected.topic, script: scriptText, minScenes, maxScenes, visualInstructions: getVisualInstructions() },
      })) as VisualScene[];
      const safeScenes = Array.isArray(scenes) ? scenes : [];
      saveVisualMap({ topicId: selected.id, scenes: safeScenes, generatedAt: Date.now() });
      toast.success(`Storyboard built — ${safeScenes.length} scenes. Now generate images`);
    });
  }

  async function genImage(scene: VisualScene) {
    if (!selected) return;
    const dataUrl = await generateSceneImage(scene);
    await putImage(sceneImageId(selected.id, scene.sceneNumber), dataUrl);
    setHave((prev) => new Set(prev).add(scene.sceneNumber));
    setFailed((prev) => {
      const n = new Set(prev);
      n.delete(scene.sceneNumber);
      return n;
    });
  }

  // Generate a batch of images, running only over the scenes passed in. Stops
  // early and saves progress if credits run out.
  async function runBatch(key: string, scenes: VisualScene[]) {
    if (!scenes.length) {
      toast.info("Nothing to generate — every image in range is already done.");
      return;
    }
    return withBusy(key, async () => {
      setProgress({ done: 0, total: scenes.length });
      for (let i = 0; i < scenes.length; i++) {
        try {
          await genImage(scenes[i]);
        } catch (e) {
          const msg = humanizeError(e, "failed");
          setFailed((prev) => new Set(prev).add(scenes[i].sceneNumber));
          if (!hasUnlimitedAccess() && /credit|CREDITS_EXHAUSTED|402/i.test(msg)) {
            toast.error("Credits exhausted. Completed images are saved — resume later.");
            break;
          }
          toast.error(`Scene ${scenes[i].sceneNumber}: ${msg}`);
        }
        setProgress({ done: i + 1, total: scenes.length });
      }
      setProgress(null);
      void refreshHave();
    });
  }

  const pendingScenes = () =>
    [...scenes]
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .filter((s) => !have.has(s.sceneNumber));

  function generateNext(n: number) {
    return runBatch(`next-${n}`, pendingScenes().slice(0, n));
  }

  function retryFailed() {
    return runBatch("retry", scenes.filter((s) => failed.has(s.sceneNumber)));
  }

  // Stable, per-scene card callbacks (read latest state via refs). Keeping these
  // referentially stable lets React.memo skip re-rendering every SceneCard when
  // unrelated page state (progress, report) changes.
  const onCardRegen = useCallback((scene: VisualScene) => {
    setBusy(`img-${scene.sceneNumber}`);
    void (async () => {
      try {
        const sel = selectedRef.current;
        if (!sel) return;
        const dataUrl = await generateSceneImage(scene);
        await putImage(sceneImageId(sel.id, scene.sceneNumber), dataUrl);
        setHave((prev) => new Set(prev).add(scene.sceneNumber));
        setFailed((prev) => {
          const n = new Set(prev);
          n.delete(scene.sceneNumber);
          return n;
        });
        toast.success(`Scene ${scene.sceneNumber} image regenerated`);
      } catch (e) {
        toast.error(humanizeError(e, "Something went wrong"));
      } finally {
        setBusy(null);
      }
    })();
  }, []);

  const onCardReplace = useCallback(async (scene: VisualScene, file: File | null) => {
    const sel = selectedRef.current;
    if (!file || !sel) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      await putImage(sceneImageId(sel.id, scene.sceneNumber), dataUrl);
      setHave((prev) => new Set(prev).add(scene.sceneNumber));
      toast.success("Image replaced");
    } catch {
      toast.error("Could not load that image");
    }
  }, []);

  const onCardDelete = useCallback((sceneNumber: number) => {
    const m = mapRef.current;
    const sel = selectedRef.current;
    if (!m || !sel || !Array.isArray(m.scenes)) return;
    deleteImage(sceneImageId(sel.id, sceneNumber));
    saveVisualMap({ ...m, scenes: m.scenes.filter((s) => s.sceneNumber !== sceneNumber) });
  }, []);

  function handleConsistency() {
    if (!selected || !map || !Array.isArray(map.scenes)) return;
    return withBusy("check", async () => {
      const withImages: number[] = [];
      for (const s of map.scenes) {
        const img = await loadImage(sceneImageId(selected.id, s.sceneNumber));
        if (img) withImages.push(s.sceneNumber);
      }
      const r = (await doCheck({
        data: { topic: selected.topic, scenes: map.scenes, withImages },
      })) as ConsistencyReport;
      setReport(r);
      toast.success("Consistency checked");
    });
  }

  return (
    <StageShell stage="visual" maxWidth="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Images</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The AI turns your script into ordered storyboard images and generates them automatically,
        using your Visual DNA for consistency. You never touch prompts.
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
        <Button onClick={handleBuildBoard} disabled={!selected || !hasValidScript || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {hasMap ? "Rebuild Storyboard" : "Build Storyboard"}
        </Button>
        {hasMap && (
          <>
            <Button variant="secondary" onClick={() => generateNext(5)} disabled={!!busy}>
              {busy === "next-5" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ImagePlus className="mr-2 h-4 w-4" /> Next 5
            </Button>
            <Button variant="secondary" onClick={() => generateNext(10)} disabled={!!busy}>
              {busy === "next-10" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Next 10
            </Button>
            <Button variant="secondary" onClick={() => generateNext(20)} disabled={!!busy}>
              {busy === "next-20" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Next 20
            </Button>
            {failed.size > 0 && (
              <Button variant="outline" onClick={retryFailed} disabled={!!busy}>
                {busy === "retry" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RotateCcw className="mr-2 h-4 w-4" /> Retry Failed ({failed.size})
              </Button>
            )}
          </>
        )}
        {hasMap && (
          <Button variant="outline" onClick={handleConsistency} disabled={!!busy}>
            {busy === "check" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check Consistency
          </Button>
        )}
      </div>

      {report && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-xs">
          <div className="mb-2 text-sm font-semibold">Consistency Report</div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["Character", report.characterConsistent],
              ["Color", report.colorConsistent],
              ["Outline", report.outlineConsistent],
              ["Background", report.backgroundConsistent],
              ["Order", report.orderOk],
            ] as [string, boolean][]).map(([k, ok]) => (
              <span
                key={k}
                className={`rounded-full px-2 py-0.5 font-medium ${
                  ok ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"
                }`}
              >
                {k}: {ok ? "OK" : "Issue"}
              </span>
            ))}
          </div>
          {report.missingScenes?.length > 0 && (
            <p className="mt-2 text-amber-600">Missing images: {report.missingScenes.join(", ")}</p>
          )}
          {report.duplicateScenes?.length > 0 && (
            <p className="mt-1 text-amber-600">Duplicate scenes: {report.duplicateScenes.join(", ")}</p>
          )}
          <p className="mt-2 text-muted-foreground">{report.summary}</p>
          {report.flagged?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {report.flagged.map((f) => (
                <li key={f.sceneNumber} className="rounded-md bg-muted/50 p-2">
                  <strong>Scene {f.sceneNumber}:</strong> {f.issues.join("; ")} — <em>{f.fix}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      {selected && !hasValidScript && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-600">
            Script is missing. Generate or paste a script first.
          </p>
          <textarea
            className="min-h-[120px] w-full resize-y rounded-md border border-input bg-background p-2 text-sm leading-relaxed"
            placeholder="Paste your script here to build a storyboard…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        </div>
      )}

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">Select a project to build a storyboard.</p>
      )}

      {selected && hasValidScript && !hasMap && (
        <p className="mt-6 text-sm text-muted-foreground">
          No storyboard yet. Click “Build Storyboard” to turn your script into scenes.
        </p>
      )}

      {hasMap && selected && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="col-span-full text-xs text-muted-foreground">
            {scenes.length} scenes · numbered {pad3(1)}–{pad3(scenes.length)} · {have.size}/
            {scenes.length} images done · {credit.label} mode (recommended batch{" "}
            {credit.defaultImageBatch})
          </div>
          {[...scenes]
            .sort((a, b) => a.sceneNumber - b.sceneNumber)
            .map((s) => (
            <SceneCard
              key={s.sceneNumber}
              scene={s}
              topicId={selected.id}
              busy={busy}
              onRegen={onCardRegen}
              onReplace={onCardReplace}
              onDelete={onCardDelete}
            />
          ))}
        </div>
      )}
    </StageShell>
  );
}

const SceneCard = memo(function SceneCard({
  scene,
  topicId,
  busy,
  onRegen,
  onReplace,
  onDelete,
}: {
  scene: VisualScene;
  topicId: string;
  busy: string | null;
  onRegen: (scene: VisualScene) => void;
  onReplace: (scene: VisualScene, file: File | null) => void;
  onDelete: (sceneNumber: number) => void;
}) {
  const img = useImage(sceneImageId(topicId, scene.sceneNumber));
  const inputId = `replace-${topicId}-${scene.sceneNumber}`;
  const generating = busy === `img-${scene.sceneNumber}`;
  const status = generating ? "Generating…" : img ? "Ready" : "No image";
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
          Scene {pad3(scene.sceneNumber)}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Voice line</span>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              generating
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : img
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {status}
          </span>
        </div>
        <p className="mt-1 text-sm italic">“{scene.voiceoverLine}”</p>
        {scene.visualDescription && (
          <p className="mt-1 text-xs text-muted-foreground">{scene.visualDescription}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => onRegen(scene)} disabled={!!busy}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
          </Button>
          <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => onReplace(scene, e.target.files?.[0] ?? null)} />
          <label htmlFor={inputId}>
            <Button asChild size="sm" variant="ghost">
              <span>
                <Upload className="mr-1 h-3.5 w-3.5" /> Replace
              </span>
            </Button>
          </label>
          <Button size="sm" variant="ghost" onClick={() => onDelete(scene.sceneNumber)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
});
