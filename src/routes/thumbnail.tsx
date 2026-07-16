import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Check, Sparkles, Code, Upload, Clock, ImageOff, Images, FileText, Zap } from "lucide-react";

import { generateThumbnails, regenerateThumbnail, reviewThumbnails } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useResearch,
  useThumbnails,
  saveThumbnails,
  useVisualMap,
} from "@/lib/store";
import { useImage, putImage, loadImage, fileToDataUrl } from "@/lib/images";
import { generateThumbnailImage, imageErrorMessage, isRateLimitError, getImageCooldownRemainingMs } from "@/lib/generate-image";
import { getFreeMode, useFreeMode } from "@/lib/free-mode";
import { useTelemetry } from "@/lib/provider-telemetry";
import { useCreditConfig } from "@/lib/credit-mode";
import { useBreaker, resetBreaker } from "@/lib/image-circuit-breaker";
import {
  useThumbRetry,
  recordThumbFailure,
  clearThumbRetry,
  resetThumbRetry,
  MAX_ATTEMPTS,
} from "@/lib/thumbnail-retry";
import { conceptFromIdea, composeTextOnlyDraft } from "@/lib/thumbnail-compositor";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { StageShell } from "@/components/StageShell";
import { Feedback } from "@/components/Feedback";
import type { ThumbnailIdea, ThumbnailReview } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";
import { getErrorDetails } from "@/lib/error-details";
import { StageErrorBoundary } from "@/components/StageErrorBoundary";
import { buildInjection } from "@/lib/generation-context";

export const Route = createFileRoute("/thumbnail")({
  head: () => ({ meta: [{ title: "Thumbnail — Stickmax Studio" }] }),
  component: () => (
    <StageErrorBoundary message="Something didn't load. Generate or paste a script first, then try again.">
      <ThumbnailPage />
    </StageErrorBoundary>
  ),
});

const thumbImageId = (topicId: string, i: number) => `thumb:${topicId}:${i}`;
const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;

const CONCEPT_ONLY_MESSAGE = "Concept ready, image pending.";

const PROVIDERS_UNAVAILABLE_MESSAGE =
  "Both free image providers are temporarily unavailable. Your thumbnail concept is saved. Retry later, use an existing scene image, or create a local thumbnail draft.";

function isProvidersUnavailableError(e: unknown): boolean {
  return e instanceof Error && (e as Error & { code?: string }).code === "PROVIDERS_UNAVAILABLE";
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const s = Math.ceil(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Normal-user friendly image error. Images run on the built-in Lovable AI, so
 *  the common failure is running out of Lovable credits (HTTP 402). Surface a
 *  clear, provider-neutral message. Raw errors stay in Developer Mode. */
function friendlyImgError(raw?: string | null): string {
  if (raw && /(402|not enough credits|credit)/i.test(raw))
    return "You're out of Lovable AI credits for image generation. Add credits in Settings → Workspace → Usage, or upload a thumbnail.";
  if (raw && /free tier is not available/i.test(raw)) return raw;
  return "Image generation is temporarily unavailable. Try again later or upload a thumbnail.";
}

/** A lightweight SVG placeholder thumbnail encoded as a data URL. Lets the user
 *  unblock export/SEO without a generated image. */
function placeholderThumbnail(title: string): string {
  const safe = (title || "Thumbnail").slice(0, 40).replace(/[<>&]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#1f2937"/><rect x="24" y="24" width="1232" height="672" fill="none" stroke="#475569" stroke-width="4" stroke-dasharray="16 12"/><text x="640" y="360" fill="#e2e8f0" font-family="sans-serif" font-size="52" font-weight="700" text-anchor="middle">${safe}</text><text x="640" y="430" fill="#94a3b8" font-family="sans-serif" font-size="28" text-anchor="middle">Placeholder — image pending</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function ThumbnailPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const research = useResearch(selectedId);
  const pack = useThumbnails(selectedId);

  const gen = useServerFn(generateThumbnails);
  const regen = useServerFn(regenerateThumbnail);
  const doReview = useServerFn(reviewThumbnails);
  const credit = useCreditConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dev, setDev] = useState(false);
  const [review, setReview] = useState<ThumbnailReview | null>(null);
  const freeMode = useFreeMode();
  const [providerLimit, setProviderLimit] = useState(false);
  const [conceptPending, setConceptPending] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [conceptProvider, setConceptProvider] = useState<string | null>(null);
  const breaker = useBreaker();
  const retryJob = useThumbRetry(selectedId ?? null);
  const visual = useVisualMap(selectedId ?? null);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const telemetry = useTelemetry();
  const pixelProvider =
    telemetry.lastProvider === "pollinations"
      ? "Pollinations"
      : telemetry.lastProvider === "puter"
        ? "Puter"
        : null;
  const uploadIndexRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydration: on first render (SSR + before localStorage flushes) `topics`
  // is [] and any `selectedId` won't resolve. We can't rely on `selected`
  // alone to gate the button — flip a mount flag so we know the client-side
  // store has been read at least once.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Canonical active-topic resolver. Priority:
  //   1. Selected id matches a normalized topic in the store  (route/store)
  //   2. Persisted selectedTopicId points to a topic we can find (persisted)
  //   3. Fallback to the first topic in the list (localStorage)
  // Always returns a non-empty title — never sends whitespace to the server.
  type ActiveTopicCtx = { topicId: string; title: string; projectId: string; source: "store" | "persisted" | "fallback" };
  const activeCtx: ActiveTopicCtx | null = useMemo(() => {
    const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
    const build = (t: (typeof topics)[number], source: ActiveTopicCtx["source"]): ActiveTopicCtx => ({
      topicId: t.id,
      projectId: t.id,
      title: clean(t.topic) || clean(t.altTitle) || "Untitled project",
      source,
    });
    if (selected) return build(selected, selectedId === selected.id ? "store" : "persisted");
    const persisted = selectedId ? topics.find((t) => t.id === selectedId) : null;
    if (persisted) return build(persisted, "persisted");
    if (topics[0]) return build(topics[0], "fallback");
    return null;
  }, [selected, selectedId, topics]);

  const topicReady = mounted && !!activeCtx;

  // Reactive truth for the FIRST thumbnail image. The "ready" state is derived
  // ONLY from an actually-stored image URL — never from concept-only data.
  const firstImg = useImage(selected ? thumbImageId(selected.id, 0) : null);
  const hasImageUrl = !!firstImg;
  const thumbnailReady = hasImageUrl && !providerLimit;
  const thumbnailStatus = providerLimit
    ? "rate_limited"
    : thumbnailReady
      ? "completed"
      : retryJob?.status === "unavailable"
        ? "provider_unavailable"
        : retryJob?.status === "waiting"
          ? "retry_waiting"
          : pack
            ? "concept_only"
            : "none";

  // Auto-clear the retry job when a stored image appears (success from any path).
  useEffect(() => {
    if (hasImageUrl && selected && retryJob) clearThumbRetry(selected.id);
  }, [hasImageUrl, selected, retryJob]);

  // Sequential 10s gap when the user asks for more variants.
  async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function handleReview() {
    if (!selected || !pack) return;
    return withBusy("review", async () => {
      const r = (await doReview({ data: { topic: selected.topic, ideas: pack.ideas } })) as ThumbnailReview;
      setReview(r);
      toast.success("Reviewed — strongest thumbnail highlighted");
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

  // Generate images for thumbnail ideas from `start` up to `count` total ideas,
  // skipping any that already have an image. Never redoes finished thumbnails.
  async function renderImages(ideas: ThumbnailIdea[], start: number, end: number, force = false): Promise<"ok" | "provider-limit" | "no-image"> {
    if (!selected) return "ok";
    const cooldownMs = getImageCooldownRemainingMs();
    if (cooldownMs > 0) {
      toast.info(`Free Queue Mode cooldown: try again in ${Math.ceil(cooldownMs / 1000)}s.`);
      return "provider-limit";
    }
    // Thumbnail Free Mode: only ever generate ONE thumbnail — never a batch of
    // variations — to avoid provider rate-limit spam.
    if (getFreeMode()) end = Math.min(end, start + 1);
    setProgress({ done: start, total: end });
    let wrote = 0;
    for (let i = start; i < end; i++) {
      // Smart cache: skip thumbnails that already have an image.
      if (!force && (await loadImage(thumbImageId(selected.id, i)))) {
        wrote++;
        setProgress({ done: i + 1, total: end });
        continue;
      }
      try {
        const url = await generateThumbnailImage(ideas[i]);
        await putImage(thumbImageId(selected.id, i), url);
        wrote++;
        // Success — clear any prior retry state for this project.
        clearThumbRetry(selected.id);
      } catch (e) {
        // Emergency Debug: surface the EXACT provider error — never a generic line.
        const msg = imageErrorMessage(e, "failed");
        setProviderError(msg);
        if (isProvidersUnavailableError(e)) {
          setProviderLimit(true);
          recordThumbFailure(selected.id, i, PROVIDERS_UNAVAILABLE_MESSAGE);
          toast.error(PROVIDERS_UNAVAILABLE_MESSAGE);
          setProgress(null);
          return "provider-limit";
        }
        if (isRateLimitError(e)) {
          setProviderLimit(true);
          recordThumbFailure(selected.id, i, msg);
          toast.error(`Thumbnail ${i + 1}: ${msg}`);
          setProgress(null);
          return "provider-limit";
        }
        toast.error(`Thumbnail ${i + 1}: ${msg}`);
        recordThumbFailure(selected.id, i, msg);
        if (/credit|402/i.test(msg)) break;
      }
      setProgress({ done: i + 1, total: end });
      // Sequential Free-Mode pacing between variants.
      if (getFreeMode() && i + 1 < end) await sleep(10_000);
    }
    setProgress(null);
    // Only report success when an actual image was stored. Otherwise the concept
    // exists but no image was generated.
    return wrote > 0 ? "ok" : "no-image";
  }

  // First click: create ideas and render only ONE thumbnail (or a few in Best
  // Quality mode). Cheapest path — no wall of 10 auto-generated thumbnails.
  function handleGenerate() {
    if (!selected || !activeCtx) {
      if (mounted && !activeCtx) toast.error("No active topic found. Return to Projects and select a topic.");
      return;
    }
    return withBusy("gen", async () => {
      setProviderLimit(false);
      setConceptPending(false);
      setProviderError(null);
      const payload = {
        projectId: activeCtx.projectId,
        topicId: activeCtx.topicId,
        topicTitle: activeCtx.title,
        storyTitle: story?.script ? activeCtx.title : undefined,
        storySummary: research?.storyAngles?.[0],
        script: story?.script,
        angle: research?.storyAngles?.[0],
        ...buildInjection(["thumbnail"]),
      };
      if (dev) console.log("[thumbnail] request", {
        resolvedTopicId: activeCtx.topicId,
        resolvedTopicTitle: activeCtx.title,
        resolvedProjectId: activeCtx.projectId,
        requestPayload: payload,
      });
      const conceptResult = (await gen({ data: payload })) as { ideas: ThumbnailIdea[]; conceptProvider: string };
      const ideas = conceptResult.ideas;
      setConceptProvider(conceptResult.conceptProvider);
      saveThumbnails({ topicId: selected.id, ideas, generatedAt: Date.now() });
      const status = await renderImages(ideas, 0, Math.min(credit.initialThumbnails, ideas.length), true);
      // Hard gate: only claim "ready" if an actual image URL is now stored.
      const storedUrl = await loadImage(thumbImageId(selected.id, 0));
      if (status === "ok" && storedUrl) {
        toast.success("First thumbnail ready. Not happy? Generate alternatives.");
      } else {
        setConceptPending(true);
        // Show the exact provider error captured during rendering — open the
        // Developer Debug panel (bottom-left) for the full raw response.
        const latest = getErrorDetails();
        if (dev && latest) toast.error(latest.message);
        else toast.error(friendlyImgError(latest?.message));
      }
    });
  }

  // Only when the user asks: render the remaining idea images as alternatives.
  function handleAlternatives() {
    if (!selected || !pack) return;
    return withBusy("alt", async () => {
      setProviderLimit(false);
      setConceptPending(false);
      const status = await renderImages(pack.ideas, 0, pack.ideas.length);
      if (status === "ok") toast.success("Alternatives generated");
      else if (status === "no-image") {
        setConceptPending(true);
        toast.warning(CONCEPT_ONLY_MESSAGE);
      }
    });
  }

  function handleRegen(index: number) {
    if (!selected || !pack || !activeCtx) return;
    return withBusy(`i-${index}`, async () => {
      setProviderLimit(false);
      const updated = (await regen({ data: { topic: activeCtx.title, topicTitle: activeCtx.title, idea: pack.ideas[index] } })) as ThumbnailIdea;
      const ideas = pack.ideas.map((it, i) => (i === index ? updated : it));
      saveThumbnails({ ...pack, ideas, generatedAt: Date.now() });
      try {
        const url = await generateThumbnailImage(updated);
        await putImage(thumbImageId(selected.id, index), url);
        toast.success("Thumbnail regenerated");
      } catch (e) {
        const msg = imageErrorMessage(e, "failed");
        setProviderError(msg);
        if (isRateLimitError(e)) setProviderLimit(true);
        toast.error(msg);
        return;
      }
    });
  }

  function handleChoose(index: number) {
    if (!pack) return;
    saveThumbnails({ ...pack, ideas: pack.ideas.map((it, i) => ({ ...it, chosen: i === index })) });
    toast.success("Thumbnail chosen");
  }

  // Generate the concept now, render the image later — keeps the concept saved
  // without attempting (and possibly failing) image generation.
  function handleGenerateLater() {
    if (!selected || !activeCtx) {
      if (mounted && !activeCtx) toast.error("No active topic found. Return to Projects and select a topic.");
      return;
    }
    return withBusy("later", async () => {
      setProviderLimit(false);
      const laterResult = (await gen({
        data: {
          projectId: activeCtx.projectId,
          topicId: activeCtx.topicId,
          topicTitle: activeCtx.title,
          script: story?.script,
          angle: research?.storyAngles?.[0],
          ...buildInjection(["thumbnail"]),
        },
      })) as { ideas: ThumbnailIdea[]; conceptProvider: string };
      setConceptProvider(laterResult.conceptProvider);
      saveThumbnails({ topicId: selected.id, ideas: laterResult.ideas, generatedAt: Date.now() });
      setConceptPending(true);
      toast.success("Concept saved. Generate the image whenever you're ready.");
    });
  }

  // Manual upload: store the user's own image for a specific thumbnail slot.
  function openUpload(index: number) {
    uploadIndexRef.current = index;
    fileInputRef.current?.click();
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    try {
      const url = await fileToDataUrl(file);
      await putImage(thumbImageId(selected.id, uploadIndexRef.current), url);
      setProviderLimit(false);
      setConceptPending(false);
      toast.success("Thumbnail uploaded");
    } catch {
      toast.error("Could not read that image file");
    }
  }

  // Placeholder: store a generated SVG placeholder so export/SEO aren't blocked.
  async function handlePlaceholder() {
    if (!selected) return;
    const idea = pack?.ideas?.[0];
    await putImage(thumbImageId(selected.id, 0), placeholderThumbnail(idea?.thumbnailTitle ?? selected.topic));
    setProviderLimit(false);
    setConceptPending(false);
    toast.success("Placeholder thumbnail added");
  }

  // "Use Existing Scene Image" — reuse a completed storyboard image as the
  // illustration layer. Runs the local compositor only. No provider request.
  async function handleUseExistingScene(sceneNumber: number) {
    if (!selected || !pack) return;
    return withBusy("scene", async () => {
      const img = await loadImage(sceneImageId(selected.id, sceneNumber));
      if (!img) {
        toast.error("That storyboard image isn't stored yet.");
        return;
      }
      const { composeThumbnail } = await import("@/lib/thumbnail-compositor");
      const concept = conceptFromIdea(pack.ideas[0]);
      const composed = await composeThumbnail(concept, img);
      await putImage(thumbImageId(selected.id, 0), composed);
      clearThumbRetry(selected.id);
      setProviderLimit(false);
      setProviderError(null);
      setShowScenePicker(false);
      toast.success("Thumbnail built from existing scene image.");
    });
  }

  // "Create Text-Only Thumbnail Draft" — zero-provider fallback using compositor.
  async function handleTextDraft() {
    if (!selected) return;
    return withBusy("draft", async () => {
      const idea =
        pack?.ideas?.[0] ??
        ({
          thumbnailTitle: selected.topic,
          textOnThumbnail: selected.topic,
          mainSubject: "",
          mainVisualConcept: "",
          composition: "",
          background: "",
          emotion: "curious",
          ctrScore: 0,
          imagePrompt: "",
          whyItWorks: "",
        } as ThumbnailIdea);
      const concept = conceptFromIdea(idea);
      const draft = await composeTextOnlyDraft(concept);
      await putImage(thumbImageId(selected.id, 0), draft);
      clearThumbRetry(selected.id);
      setProviderLimit(false);
      setProviderError(null);
      toast.success("Local Thumbnail Draft created — no AI image used.");
    });
  }

  // "Retry Now" — clear the cooldown/pause and immediately try again.
  function handleRetryNow() {
    if (!selected) return;
    resetBreaker();
    resetThumbRetry(selected.id);
    setProviderLimit(false);
    setProviderError(null);
    void handleGenerate();
  }

  // "Retry Later" — just dismiss the error banner; job stays persisted.
  function handleRetryLater() {
    setProviderLimit(false);
    toast.message("Thumbnail concept saved. Come back later — the retry state is preserved.");
  }

  // Sequential "Generate More Variants" — one at a time with 10s spacing.
  function handleGenerateMoreVariants() {
    if (!selected || !pack) return;
    return withBusy("more", async () => {
      setProviderLimit(false);
      setConceptPending(false);
      const nextIndex = pack.ideas.findIndex((_, i) => !firstImg && i === 0)
        + 0; // placeholder to appease TS
      // Find first slot without an image
      let start = 0;
      for (let i = 0; i < pack.ideas.length; i++) {
        const has = await loadImage(thumbImageId(selected.id, i));
        if (!has) { start = i; break; }
        start = i + 1;
      }
      void nextIndex;
      const end = Math.min(pack.ideas.length, start + 1);
      const status = await renderImages(pack.ideas, start, end);
      if (status === "ok") toast.success("Variant generated.");
    });
  }

  return (
    <StageShell stage="thumbnail" maxWidth="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Thumbnail Engine</h1>
        <Button size="sm" variant="ghost" onClick={() => setDev((v) => !v)}>
          <Code className="mr-1 h-4 w-4" /> {dev ? "Hide" : "Developer"} Mode
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Real generated thumbnail concepts with CTR scoring. No prompts — just pick a winner.
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
        <Button onClick={handleGenerate} disabled={!topicReady || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {!mounted ? "Loading selected topic…" : pack ? "Regenerate First Thumbnail" : "Generate Thumbnail"}
        </Button>
        <Button variant="outline" onClick={() => openUpload(0)} disabled={!selected || !!busy}>
          <Upload className="mr-2 h-4 w-4" /> Upload Thumbnail Manually
        </Button>
        <Button variant="outline" onClick={handlePlaceholder} disabled={!selected || !!busy}>
          <ImageOff className="mr-2 h-4 w-4" /> Use Placeholder Thumbnail
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadFile} />
        {pack && (
          <>
            <Button variant="outline" onClick={() => setShowScenePicker(true)} disabled={!!busy}>
              <Images className="mr-2 h-4 w-4" /> Use Existing Scene Image
            </Button>
            <Button variant="outline" onClick={handleTextDraft} disabled={!!busy}>
              {busy === "draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" /> Create Text-Only Draft
            </Button>
          </>
        )}
        {pack && hasImageUrl && freeMode && (
          <Button variant="secondary" onClick={handleGenerateMoreVariants} disabled={!!busy}>
            {busy === "more" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Sparkles className="mr-2 h-4 w-4" /> Generate More Variants
          </Button>
        )}
        {/* Developer-only actions */}
        {dev && (
          <>
            <Button variant="secondary" onClick={handleGenerateLater} disabled={!selected || !!busy}>
              {busy === "later" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Clock className="mr-2 h-4 w-4" /> Generate Thumbnail Later
            </Button>
            {pack && !freeMode && (
              <Button variant="secondary" onClick={handleAlternatives} disabled={!!busy}>
                {busy === "alt" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Sparkles className="mr-2 h-4 w-4" /> Generate Alternatives
              </Button>
            )}
            {pack && (
              <Button variant="outline" onClick={handleReview} disabled={!!busy}>
                {busy === "review" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Review Thumbnails
              </Button>
            )}
          </>
        )}
      </div>

      {/* Provider status pills — visible whenever any cooldown or pause is live. */}
      {selected && (breaker.pollinations.cooldownRemainingMs > 0 || breaker.pollinations.pausedRemainingMs > 0 || breaker.puter.cooldownRemainingMs > 0 || breaker.puter.pausedRemainingMs > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 ${breaker.pollinations.pausedRemainingMs > 0 ? "bg-destructive/15 text-destructive" : breaker.pollinations.cooldownRemainingMs > 0 ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
            Pollinations — {breaker.pollinations.pausedRemainingMs > 0 ? `Paused ${formatCountdown(breaker.pollinations.pausedRemainingMs)}` : breaker.pollinations.cooldownRemainingMs > 0 ? `Rate Limited ${formatCountdown(breaker.pollinations.cooldownRemainingMs)}` : "Ready"}
          </span>
          <span className={`rounded-full px-3 py-1 ${breaker.puter.pausedRemainingMs > 0 ? "bg-destructive/15 text-destructive" : breaker.puter.cooldownRemainingMs > 0 ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
            Puter — {breaker.puter.pausedRemainingMs > 0 ? `Unavailable ${formatCountdown(breaker.puter.pausedRemainingMs)}` : breaker.puter.cooldownRemainingMs > 0 ? `Cooling ${formatCountdown(breaker.puter.cooldownRemainingMs)}` : "Ready"}
          </span>
          {retryJob?.nextRetryAt && (
            <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
              Next Retry — {formatCountdown(retryJob.nextRetryAt - Date.now())}
            </span>
          )}
        </div>
      )}

      {/* Retry Waiting / Provider Unavailable banner with recovery actions. */}
      {selected && retryJob && retryJob.status !== "idle" && (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            {retryJob.status === "unavailable"
              ? `Provider unavailable after ${MAX_ATTEMPTS} attempts.`
              : `Retry Waiting — attempt ${retryJob.attempts + 1} of ${MAX_ATTEMPTS}.`}
          </p>
          <p className="mt-1 text-muted-foreground">{PROVIDERS_UNAVAILABLE_MESSAGE}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" onClick={handleRetryNow} disabled={!!busy}>
              <Zap className="mr-1 h-3.5 w-3.5" /> Retry Now
            </Button>
            <Button size="sm" variant="secondary" onClick={handleRetryLater} disabled={!!busy}>
              <Clock className="mr-1 h-3.5 w-3.5" /> Retry Later
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowScenePicker(true)} disabled={!!busy}>
              <Images className="mr-1 h-3.5 w-3.5" /> Use Existing Scene Image
            </Button>
            <Button size="sm" variant="outline" onClick={() => openUpload(0)} disabled={!!busy}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Upload Background
            </Button>
            <Button size="sm" variant="outline" onClick={handleTextDraft} disabled={!!busy}>
              <FileText className="mr-1 h-3.5 w-3.5" /> Text-Only Draft
            </Button>
          </div>
          {dev && retryJob.lastError && (
            <p className="mt-2 whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-[11px] text-destructive">
              {retryJob.lastError}
            </p>
          )}
        </div>
      )}

      {freeMode && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          Free Queue Mode: generates only 1 thumbnail image and disables multiple variations.
        </p>
      )}

      {/* Hard state message: only show "ready" when an actual image URL exists. */}
      {selected && pack && (
        thumbnailReady ? (
          <p className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
            First thumbnail ready.
          </p>
        ) : providerError && !retryJob ? (
          dev ? (
            // Developer Mode: surface the EXACT raw provider error.
            <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {providerError}
            </p>
          ) : (
            // Normal users: short, friendly message only.
            <p className="mt-3 text-xs text-muted-foreground">
              {friendlyImgError(providerError)}
            </p>
          )
        ) : null
      )}

      {/* Debug line — reflects the raw thumbnail state, never concept-only. */}
      {selected && dev && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
          <div>Active Topic ID: {activeCtx?.topicId ?? "—"}</div>
          <div>Active Title: {activeCtx?.title ?? "—"}</div>
          <div>Project ID: {activeCtx?.projectId ?? "—"}</div>
          <div>Source: {activeCtx?.source ?? "—"}</div>
          <div>Thumbnail Status: {thumbnailStatus}</div>
          <div>Has Image URL: {hasImageUrl ? "true" : "false"}</div>
          <div>Concept Provider: {conceptProvider ?? "—"}</div>
          <div>Pixel Provider: {pixelProvider ?? "—"}</div>
          <div>Provider Error: {providerError ?? (providerLimit ? "rate_limited" : "none")}</div>
        </div>
      )}

      {conceptPending && !providerLimit && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          {CONCEPT_ONLY_MESSAGE} Retry generation, upload a thumbnail, or use a placeholder.
        </p>
      )}

      {review && (
        <p className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Recommended: #{review.recommendedIndex + 1}.</strong>{" "}
          {review.reason}
        </p>
      )}

      {progress && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">
            Generating thumbnails… {progress.done}/{progress.total}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {!selected && <p className="mt-6 text-sm text-muted-foreground">Select a project to start.</p>}

      {mounted && !activeCtx && topics.length === 0 && (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          No active topic found. Return to Projects and select a topic.
        </p>
      )}

      {pack && selected && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pack.ideas.map((it, i) => (
            <ThumbCard
              key={i}
              idea={it}
              index={i}
              topicId={selected.id}
              busy={busy}
              dev={dev}
              scored={review?.scored?.find((s) => s.index === i) ?? null}
              recommended={review?.recommendedIndex === i}
              onRegen={() => handleRegen(i)}
              onChoose={() => handleChoose(i)}
              onUpload={() => openUpload(i)}
            />
          ))}
        </div>
      )}

      {showScenePicker && selected && (
        <ScenePicker
          topicId={selected.id}
          sceneNumbers={(visual?.scenes ?? []).map((s) => s.sceneNumber)}
          onClose={() => setShowScenePicker(false)}
          onPick={handleUseExistingScene}
        />
      )}
    </StageShell>
  );
}

function ScenePicker({
  topicId,
  sceneNumbers,
  onClose,
  onPick,
}: {
  topicId: string;
  sceneNumbers: number[];
  onClose: () => void;
  onPick: (n: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Use an existing scene image</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The local compositor adds the headline, highlight and layout — no provider request is made.
        </p>
        {sceneNumbers.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No storyboard scenes exist for this project yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {sceneNumbers.map((n) => (
              <ScenePickerCard key={n} topicId={topicId} sceneNumber={n} onPick={() => onPick(n)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScenePickerCard({ topicId, sceneNumber, onPick }: { topicId: string; sceneNumber: number; onPick: () => void }) {
  const img = useImage(`scene:${topicId}:${sceneNumber}`);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!img}
      className="group flex flex-col overflow-hidden rounded-lg border border-border text-left transition hover:border-primary disabled:opacity-50"
    >
      <div className="flex aspect-video items-center justify-center bg-muted/40">
        {img ? (
          <img src={img} alt={`Scene ${sceneNumber}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No image</span>
        )}
      </div>
      <div className="px-2 py-1.5 text-xs">Scene {sceneNumber}</div>
    </button>
  );
}

function ThumbCard({
  idea,
  index,
  topicId,
  busy,
  dev,
  scored,
  recommended,
  onRegen,
  onChoose,
  onUpload,
}: {
  idea: ThumbnailIdea;
  index: number;
  topicId: string;
  busy: string | null;
  dev: boolean;
  scored: ThumbnailReview["scored"][number] | null;
  recommended: boolean;
  onRegen: () => void;
  onChoose: () => void;
  onUpload: () => void;
}) {
  const img = useImage(thumbImageId(topicId, index));
  const working = busy === `i-${index}`;
  return (
    <div className={`overflow-hidden rounded-xl border ${idea.chosen || recommended ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <div className="relative flex aspect-video items-center justify-center bg-muted/30">
        {img ? (
          <img src={img} alt={idea.thumbnailTitle} className="h-full w-full object-cover" />
        ) : (
          <span className="px-3 text-center text-xs text-amber-600">Concept ready, image pending.</span>
        )}
        {working && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {recommended && (
          <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            Recommended
          </span>
        )}
        {idea.chosen && (
          <span className="absolute right-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            Chosen
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium">{idea.thumbnailTitle}</div>
          <Feedback kind="thumbnail" content={`${idea.thumbnailTitle} — ${idea.mainVisualConcept}`} topicId={topicId} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Score label="CTR" value={idea.ctrScore} />
          <Meta label="Emotion" value={idea.emotion} />
          <Meta label="Composition" value={idea.composition} />
        </div>
        {scored && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Score label="Read" value={scored.readability} />
            <Score label="Curiosity" value={scored.curiosity} />
            <Score label="Overall" value={scored.overall} />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{idea.whyItWorks}</p>
        {dev && (
          <p className="mt-2 rounded bg-muted p-2 text-[11px] text-muted-foreground">
            Prompt: {idea.imagePrompt}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" onClick={onChoose} disabled={!!busy || !img}>
            <Check className="mr-1 h-3.5 w-3.5" /> Choose
          </Button>
          <Button size="sm" variant="secondary" onClick={onRegen} disabled={!!busy}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
          </Button>
          <Button size="sm" variant="ghost" onClick={onUpload} disabled={!!busy}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Upload
          </Button>
        </div>
      </div>
    </div>
  );
}
