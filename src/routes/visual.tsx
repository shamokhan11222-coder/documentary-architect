import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Upload, Trash2, ImagePlus, RotateCcw, Images, PlayCircle } from "lucide-react";

import { generateVisualMap, checkImageConsistency } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useVisualMap,
  saveVisualMap,
} from "@/lib/store";
import { useVoice } from "@/lib/production";
import {
  PACING_PRESETS,
  WPM_PRESETS,
  DEFAULT_WPM,
  MIN_SCENE_COUNT,
  MAX_SCENE_COUNT,
  MIN_SCENE_SECONDS,
  MAX_SCENE_SECONDS,
  SCENES_PER_BATCH,
  wordCount,
  resolveScriptDuration,
  computeTargetSceneCount,
  splitScriptForBatches,
  localScenesFromScript,
  mergeAndRenumber,
  assignSceneTimings,
  validateScenePlan,
  formatDuration,
  pacingLabel,
  type PacingMode,
  type SpeechRate,
} from "@/lib/scene-planner";
import { useImage, putImage, deleteImage, fileToDataUrl, loadImage } from "@/lib/images";
import { generateSceneImage, generateTestImage, imageErrorMessage, isRateLimitError, PROVIDER_FREE_TIER_LIMIT_MESSAGE, getImageCooldownRemainingMs } from "@/lib/generate-image";
import { useFreeMode, setFreeMode } from "@/lib/free-mode";
import { usePuterStatus, type PuterStatus } from "@/lib/puter-image";
import { getVisualInstructions } from "@/lib/visual-instructions";
import {
  imageProviderReady,
  enforceZeroBudgetImageRouting,
  saveProviderSettings,
  useImageProviderStatus,
  type ProviderChoice,
} from "@/lib/provider";
import { ImageQueuePanel } from "@/components/ImageQueuePanel";
import {
  configureImageQueue,
  startImageQueue,
} from "@/lib/image-queue";
import { getImagePipelineDebug } from "@/lib/image-pipeline";
import { useTelemetry } from "@/lib/provider-telemetry";
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

/** Human-readable label for the Puter AI provider status. */
function puterStatusLabel(s: PuterStatus): string {
  switch (s) {
    case "connected":
      return "Connected";
    case "generating":
      return "Generating";
    case "rate-limited":
      return "Rate Limited";
    case "offline":
      return "Offline";
    default:
      return "Ready";
  }
}

/** A stored image only counts as "generated" if it's a real, non-empty
 *  data/http image URL. Empty strings or junk left over from a failed run
 *  must NOT be treated as done, or scenes get skipped forever. */
function isValidImage(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const v = url.trim();
  if (v.length < 16) return false;
  return v.startsWith("data:image") || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("blob:");
}

// Local fallback lives in src/lib/scene-planner.ts (localScenesFromScript).

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
  // A saved map with an empty scenes array is a failed/invalid storyboard.
  const emptyMap = !!map && scenes.length === 0;

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
  const imageProviderStatus = useImageProviderStatus();
  const telemetry = useTelemetry();
  const freeMode = useFreeMode();
  const puterStatus = usePuterStatus();
  const canGenerateImages = hasMap && imageProviderStatus.ok;
  const [busy, setBusy] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: number | null } | null>(null);
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  // Which scenes already have a generated image (smart cache — never redo these)
  // and which failed on the last run (for "Retry Failed Only").
  const [have, setHave] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Set<number>>(new Set());
  // Scenes deferred by a rate limit — NOT permanent failures. They resume later.
  const [rateLimited, setRateLimited] = useState<Set<number>>(new Set());
  const debugEntries = getImagePipelineDebug();
  const lastDebug = debugEntries[debugEntries.length - 1] ?? null;

  useEffect(() => {
    enforceZeroBudgetImageRouting();
  }, []);

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

  // ---- Sequential image queue wiring (Puter → Pollinations) ----
  const haveRef = useRef(have);
  haveRef.current = have;
  useEffect(() => {
    const sel = selected;
    if (!sel) return;
    configureImageQueue({
      done: (n) => haveRef.current.has(n),
      save: async (scene, image) => {
        await putImage(sceneImageId(sel.id, scene.sceneNumber), image);
        setHave((prev) => new Set(prev).add(scene.sceneNumber));
        setFailed((prev) => {
          const s = new Set(prev);
          s.delete(scene.sceneNumber);
          return s;
        });
      },
    });
  }, [selected]);

  function startQueue() {
    if (!selected) return;
    const pending = [...scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
    if (!pending.length) {
      toast.info("No storyboard scenes to generate.");
      return;
    }
    return withBusy("start-queue", async () => {
      // Zero-budget pipeline: Puter (primary) → Pollinations (fallback).
      // Generate ONE test image first; only start the queue if it succeeds so
      // we never launch the full run against a dead provider.
      const first = pending.find((s) => !have.has(s.sceneNumber)) ?? pending[0];
      toast.info("Testing image generation — Puter → Pollinations…");
      const testImage = await generateSceneImage(first);
      if (!isValidImage(testImage)) {
        toast.error("Test image failed: no image returned");
        return;
      }
      await putImage(sceneImageId(selected.id, first.sceneNumber), testImage);
      setHave((prev) => new Set(prev).add(first.sceneNumber));
      toast.success("Test image OK — Puter AI / Pollinations. Starting queue.");
      // Enable the queue for the remaining scenes (completed ones are skipped),
      // one image at a time with the configured delay.
      startImageQueue(pending);
    });
  }

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
      let safeScenes: VisualScene[] = [];
      try {
        const scenes = (await gen({
          data: { topic: selected.topic, script: scriptText, minScenes, maxScenes, visualInstructions: getVisualInstructions() },
        })) as VisualScene[];
        safeScenes = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
      } catch (e) {
        // fall through to local rebuild below
        safeScenes = [];
      }

      // If the AI produced no usable scenes, rebuild locally from the script so
      // the storyboard is never empty when a valid script exists.
      if (safeScenes.length === 0) {
        safeScenes = scenesFromScript(scriptText);
      }

      // A storyboard is only "built" when it actually has scenes. An empty map
      // must be treated as Failed — never saved and never shown as completed.
      if (safeScenes.length === 0) {
        toast.error("No storyboard scenes found. Generate Story first, then rebuild storyboard.");
        return;
      }

      saveVisualMap({ topicId: selected.id, scenes: safeScenes, generatedAt: Date.now() });
      toast.success(`Storyboard built — ${safeScenes.length} scenes. Now generate images`);
    });
  }

  async function genImage(scene: VisualScene) {
    if (!selected) return;
    const ready = imageProviderReady();
    if (!ready.ok) throw new Error(ready.message);
    const dataUrl = await generateSceneImage(scene);
    if (!isValidImage(dataUrl)) throw new Error("Image generation returned no image");
    await putImage(sceneImageId(selected.id, scene.sceneNumber), dataUrl);
    setHave((prev) => new Set(prev).add(scene.sceneNumber));
    setFailed((prev) => {
      const n = new Set(prev);
      n.delete(scene.sceneNumber);
      return n;
    });
    setRateLimited((prev) => {
      const n = new Set(prev);
      n.delete(scene.sceneNumber);
      return n;
    });
  }

  // Generate a batch of images, running only over the scenes passed in. Stops
  // early and saves progress if credits run out.
  async function runBatch(key: string, requestedScenes: VisualScene[]) {
    const scenes = freeMode ? requestedScenes.slice(0, 1) : requestedScenes;
    if (!scenes.length) {
      toast.info("Nothing to generate — every image in range is already done.");
      return;
    }
    const cooldownMs = getImageCooldownRemainingMs();
    if (cooldownMs > 0) {
      toast.info(`Free Queue Mode cooldown: try again in ${Math.ceil(cooldownMs / 1000)}s.`);
      return;
    }
    // Requirement: images must use the active Image Provider. If it isn't
    // configured, do not start generation and never fall back to built-in AI.
    const ready = imageProviderReady();
    if (!ready.ok) {
      toast.error(ready.message ?? "Zero-Budget image mode is ready: Puter AI primary, Pollinations fallback.");
      return;
    }
    return withBusy(key, async () => {
      setProgress({ done: 0, total: scenes.length, current: scenes[0]?.sceneNumber ?? null });
      for (let i = 0; i < scenes.length; i++) {
        setProgress({ done: i, total: scenes.length, current: scenes[i].sceneNumber });
        try {
          await genImage(scenes[i]);
        } catch (e) {
          const msg = imageErrorMessage(e, "failed");
          // Provider limits are NEVER permanent failures. Mark the scene as
          // Provider Limit, keep every completed image, and stop immediately.
          if (isRateLimitError(e)) {
            setRateLimited((prev) => new Set(prev).add(scenes[i].sceneNumber));
            toast.warning(PROVIDER_FREE_TIER_LIMIT_MESSAGE);
            break;
          }
          setFailed((prev) => new Set(prev).add(scenes[i].sceneNumber));
          if (!hasUnlimitedAccess() && /credit|CREDITS_EXHAUSTED|402/i.test(msg)) {
            toast.error("Credits exhausted. Completed images are saved — resume later.");
            break;
          }
          toast.error(`Scene ${scenes[i].sceneNumber}: ${msg}`);
        }
        setProgress({ done: i + 1, total: scenes.length, current: scenes[i].sceneNumber });
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

  // Free Mode: generate exactly one image (the first pending scene).
  function generateOne() {
    return runBatch("one", pendingScenes().slice(0, 1));
  }

  // Resume from the first pending scene, including scenes marked Provider Limit.
  function generateNextAvailable() {
    return runBatch("next-available", pendingScenes().slice(0, 1));
  }

  // Generate every pending scene, in order (001, 002, 003 …). Sequential —
  // the shared queue guarantees no parallel spam.
  function generateAll() {
    return runBatch("all", pendingScenes());
  }

  // Resume generation from the first failed scene onward.
  function continueFromFailed() {
    if (failed.size === 0) return generateAll();
    const firstFailed = Math.min(...failed);
    return runBatch("continue", pendingScenes().filter((s) => s.sceneNumber >= firstFailed));
  }

  function retryFailed() {
    return runBatch("retry", scenes.filter((s) => failed.has(s.sceneNumber)));
  }

  function handleImageProviderChange(choice: ProviderChoice) {
    saveProviderSettings({ image: choice });
    setRateLimited(new Set());
  }

  function handleTestImageProvider() {
    setBusy("test-provider");
    void (async () => {
      try {
        const provider = imageProviderStatus.choice === "pollinations" ? "pollinations" : "puter";
        const result = await generateTestImage(provider);
        if (!result.ok) throw new Error(result.error ?? "Image provider test failed");
        toast.success(`${provider === "puter" ? "Puter AI" : "Pollinations"} test image generated — ready to generate`);
      } catch (e) {
        toast.error(imageErrorMessage(e, "Image provider test failed"));
      } finally {
        setBusy(null);
      }
    })();
  }

  // Repair: drop any stored image that is missing/invalid so those scenes
  // become pending again, then re-scan. Fixes "status completed but no image".
  function repairMissing() {
    if (!selected || scenes.length === 0) return;
    return withBusy("repair", async () => {
      let repaired = 0;
      for (const sc of scenes) {
        const id = sceneImageId(selected.id, sc.sceneNumber);
        const img = await loadImage(id);
        if (!isValidImage(img)) {
          if (img != null) await deleteImage(id);
          repaired++;
        }
      }
      await refreshHave();
      setFailed(new Set());
      setRateLimited(new Set());
      toast.success(
        repaired > 0
          ? `${repaired} scene(s) marked pending — use Next 5/10/20 to generate.`
          : "All images present and valid.",
      );
    });
  }

  // Reset: clear every generated image for this project so the whole
  // storyboard can be regenerated from scratch. Scenes are preserved.
  function resetImages() {
    if (!selected || scenes.length === 0) return;
    return withBusy("reset", async () => {
      for (const sc of scenes) {
        await deleteImage(sceneImageId(selected.id, sc.sceneNumber));
      }
      setHave(new Set());
      setFailed(new Set());
      setRateLimited(new Set());
      toast.success("Image status reset — all scenes are pending.");
    });
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
        const ready = imageProviderReady();
        if (!ready.ok) throw new Error(ready.message);
        const dataUrl = await generateSceneImage(scene);
        if (!isValidImage(dataUrl)) throw new Error("Image generation returned no image");
        await putImage(sceneImageId(sel.id, scene.sceneNumber), dataUrl);
        setHave((prev) => new Set(prev).add(scene.sceneNumber));
        setFailed((prev) => {
          const n = new Set(prev);
          n.delete(scene.sceneNumber);
          return n;
        });
        toast.success(`Scene ${scene.sceneNumber} image regenerated`);
      } catch (e) {
        if (isRateLimitError(e)) {
          setRateLimited((prev) => new Set(prev).add(scene.sceneNumber));
          toast.warning(PROVIDER_FREE_TIER_LIMIT_MESSAGE);
        } else {
          toast.error(imageErrorMessage(e, "Something went wrong"));
        }
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
            <Button onClick={generateAll} disabled={!!busy || !canGenerateImages || freeMode}>
              {busy === "all" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Images className="mr-2 h-4 w-4" /> Generate All Images
            </Button>
            <Button variant="secondary" onClick={generateOne} disabled={!!busy || !canGenerateImages}>
              {busy === "one" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ImagePlus className="mr-2 h-4 w-4" /> Generate One Image
            </Button>
            <Button variant="secondary" onClick={generateNextAvailable} disabled={!!busy || !canGenerateImages}>
              {busy === "next-available" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <PlayCircle className="mr-2 h-4 w-4" /> Generate Next Available Image
            </Button>
            <Button variant="secondary" onClick={() => generateNext(5)} disabled={!!busy || !canGenerateImages || freeMode}>
              {busy === "next-5" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ImagePlus className="mr-2 h-4 w-4" /> Next 5
            </Button>
            <Button variant="secondary" onClick={() => generateNext(10)} disabled={!!busy || !canGenerateImages || freeMode}>
              {busy === "next-10" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Next 10
            </Button>
            <Button variant="secondary" onClick={() => generateNext(20)} disabled={!!busy || !canGenerateImages || freeMode}>
              {busy === "next-20" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Next 20
            </Button>
            {failed.size > 0 && (
              <>
                <Button variant="outline" onClick={retryFailed} disabled={!!busy || !canGenerateImages || freeMode}>
                  {busy === "retry" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry Failed ({failed.size})
                </Button>
                <Button variant="outline" onClick={continueFromFailed} disabled={!!busy || !canGenerateImages || freeMode}>
                  {busy === "continue" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <PlayCircle className="mr-2 h-4 w-4" /> Continue From Failed Scene
                </Button>
              </>
            )}
          </>
        )}
        {hasMap && (
          <Button variant="outline" onClick={handleConsistency} disabled={!!busy}>
            {busy === "check" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check Consistency
          </Button>
        )}
        {hasMap && (
          <>
            <Button variant="outline" onClick={repairMissing} disabled={!!busy}>
              {busy === "repair" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Repair Missing Images
            </Button>
            <Button variant="ghost" onClick={resetImages} disabled={!!busy}>
              {busy === "reset" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Image Status
            </Button>
          </>
        )}
      </div>

      {hasMap && <ImageQueuePanel onStart={startQueue} />}

      {hasMap && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Image Provider</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={imageProviderStatus.choice}
                onChange={(e) => handleImageProviderChange(e.target.value as ProviderChoice)}
              >
                <option value="puter">Puter AI (primary)</option>
                <option value="pollinations">Pollinations (fallback)</option>
                <option value="gemini" disabled>Gemini Image — coming soon</option>
                <option value="openai" disabled>OpenAI Images — coming soon</option>
                <option value="recraft" disabled>Recraft — coming soon</option>
              </select>
            </label>
            <Button variant="outline" onClick={handleTestImageProvider} disabled={!!busy}>
              {busy === "test-provider" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Image Provider
            </Button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={freeMode}
              onChange={(e) => setFreeMode(e.target.checked)}
            />
            <span className="font-medium">Free Mode</span>
            <span className="text-muted-foreground">
              Generates 1 image at a time, waits 120 seconds between requests, no parallel requests, no automatic retries. "Generate All" is disabled.
            </span>
          </label>
          {rateLimited.size > 0 && (
            <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              {PROVIDER_FREE_TIER_LIMIT_MESSAGE} {rateLimited.size} scene(s) marked Provider Limit — completed images are saved and you can resume later.
            </p>
          )}
          {!imageProviderStatus.connected && (
            <p className="mt-3 text-xs text-amber-600">
              Zero-Budget image mode uses Puter AI primary and Pollinations fallback.
            </p>
          )}
          {imageProviderStatus.connected && !imageProviderStatus.testPassed && (
            <p className="mt-3 text-xs text-amber-600">Test image provider before generating.</p>
          )}
          <div className="mt-3 grid gap-1 font-mono text-xs text-muted-foreground">
            <div>Active Image Provider: {imageProviderStatus.connected ? imageProviderStatus.label : "Built-in AI disabled"}</div>
            <div>Provider Status: {imageProviderStatus.message}</div>
            <div>Final Provider Route: Puter AI primary → Pollinations fallback</div>
            {imageProviderStatus.choice === "puter" && (
              <div>Puter AI: {puterStatusLabel(busy?.startsWith("all") || busy?.startsWith("next") || busy === "one" || busy === "next-available" ? "generating" : puterStatus)}</div>
            )}
            <div>Last Image Error: {telemetry.lastError ?? "—"}</div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={devMode}
              onChange={(e) => setDevMode(e.target.checked)}
            />
            <span className="font-medium">Developer Mode</span>
          </label>
          {devMode && (
            <div className="mt-3 grid gap-1 rounded-md bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground">
              <div>active provider: {imageProviderStatus.label}</div>
              <div>function invoked: {lastDebug?.functionInvoked ?? "generateSceneImage → generatePipelineImage"}</div>
              <div>final provider route: {lastDebug?.finalProviderRoute ?? "Puter AI primary → Pollinations fallback"}</div>
              <div>request URL/domain: {lastDebug ? `${lastDebug.requestUrl} / ${lastDebug.requestDomain}` : "—"}</div>
              <div>fallback used: {lastDebug?.fallbackUsed ? "yes" : "no"}</div>
              <div>exact error: {lastDebug?.error ?? telemetry.lastError ?? "—"}</div>
              <div>flow count: {debugEntries.length}</div>
            </div>
          )}
        </div>
      )}

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
          <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>Generated {progress.done} / {progress.total} scenes</span>
            {progress.current != null && <span>· Current scene {pad3(progress.current)}</span>}
            <span>· Pending {Math.max(0, progress.total - progress.done)}</span>
            <span>· Completed {have.size}</span>
            <span>· Failed {failed.size}</span>
            {rateLimited.size > 0 && <span>· Provider Limit {rateLimited.size}</span>}
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
        <div className="mt-6 space-y-3">
          {emptyMap ? (
            <>
              <p className="text-sm text-amber-600">
                No storyboard scenes found. Generate Story first, then rebuild storyboard.
              </p>
              <Button onClick={handleBuildBoard} disabled={!!busy}>
                {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="mr-2 h-4 w-4" /> Rebuild Storyboard
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Build storyboard first.</p>
          )}
        </div>
      )}

      {hasMap && selected && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="col-span-full flex flex-wrap gap-2 text-xs">
            {([
              ["Total scenes", scenes.length, "bg-muted text-muted-foreground"],
              ["Images generated", have.size, "bg-green-500/15 text-green-600"],
              ["Images missing", Math.max(0, scenes.length - have.size), "bg-amber-500/15 text-amber-600"],
              ["Pending", pendingScenes().length, "bg-blue-500/15 text-blue-600"],
              ["Provider Limit", rateLimited.size, "bg-orange-500/15 text-orange-600"],
              ["Failed", failed.size, "bg-red-500/15 text-red-600"],
            ] as [string, number, string][]).map(([label, value, cls]) => (
              <span key={label} className={`rounded-full px-2.5 py-1 font-medium ${cls}`}>
                {label}: {value}
              </span>
            ))}
          </div>
          <div className="col-span-full text-xs text-muted-foreground">
            Numbered {pad3(1)}–{pad3(scenes.length)} · {credit.label} mode (recommended batch{" "}
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
              providerReady={imageProviderStatus.ok}
              providerLimited={rateLimited.has(s.sceneNumber)}
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
  providerReady,
  providerLimited,
  onRegen,
  onReplace,
  onDelete,
}: {
  scene: VisualScene;
  topicId: string;
  busy: string | null;
  providerReady: boolean;
  providerLimited: boolean;
  onRegen: (scene: VisualScene) => void;
  onReplace: (scene: VisualScene, file: File | null) => void;
  onDelete: (sceneNumber: number) => void;
}) {
  const img = useImage(sceneImageId(topicId, scene.sceneNumber));
  const inputId = `replace-${topicId}-${scene.sceneNumber}`;
  const generating = busy === `img-${scene.sceneNumber}`;
  const status = generating ? "Generating…" : img ? "Ready" : providerLimited ? "Provider Limit" : providerReady ? "No image" : "Pending image provider setup";
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="relative flex aspect-video items-center justify-center bg-muted/30">
        {img ? (
          <img src={img} alt={`Scene ${scene.sceneNumber}`} className="h-full w-full object-cover" />
        ) : (
          <span className="px-3 text-center text-xs text-muted-foreground">
            {providerReady ? "No image yet" : "Pending image provider setup"}
          </span>
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
                    : providerLimited
                      ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
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
          <Button size="sm" variant="secondary" onClick={() => onRegen(scene)} disabled={!!busy || !providerReady}>
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
