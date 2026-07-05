import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Check, Sparkles, Code, Upload, Clock, ImageOff } from "lucide-react";

import { generateThumbnails, regenerateThumbnail, reviewThumbnails } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useResearch,
  useThumbnails,
  saveThumbnails,
} from "@/lib/store";
import { useImage, putImage, loadImage, fileToDataUrl } from "@/lib/images";
import { generateThumbnailImage, imageErrorMessage, isRateLimitError, PROVIDER_FREE_TIER_LIMIT_MESSAGE, getImageCooldownRemainingMs } from "@/lib/generate-image";
import { getFreeMode, useFreeMode } from "@/lib/free-mode";
import { useCreditConfig } from "@/lib/credit-mode";
import { Button } from "@/components/ui/button";
import { Score, Meta } from "@/components/Score";
import { StageShell } from "@/components/StageShell";
import { Feedback } from "@/components/Feedback";
import type { ThumbnailIdea, ThumbnailReview } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";
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

const PROVIDER_LIMIT_MESSAGE = "Thumbnail not generated — provider limit reached.";
const CONCEPT_ONLY_MESSAGE = "Concept ready, image pending.";

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
  const uploadIndexRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reactive truth for the FIRST thumbnail image. The "ready" state is derived
  // ONLY from an actually-stored image URL — never from concept-only data.
  const firstImg = useImage(selected ? thumbImageId(selected.id, 0) : null);
  const hasImageUrl = !!firstImg;
  const thumbnailReady = hasImageUrl && !providerLimit;
  const thumbnailStatus = providerLimit
    ? "rate_limited"
    : thumbnailReady
      ? "completed"
      : pack
        ? "concept_only"
        : "none";

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
      } catch (e) {
        // Emergency Debug: surface the EXACT provider error — never a generic line.
        const msg = imageErrorMessage(e, "failed");
        setProviderError(msg);
        if (isRateLimitError(e)) {
          setProviderLimit(true);
          toast.error(`Thumbnail ${i + 1}: ${msg}`);
          setProgress(null);
          return "provider-limit";
        }
        toast.error(`Thumbnail ${i + 1}: ${msg}`);
        if (/credit|402/i.test(msg)) break;
      }
      setProgress({ done: i + 1, total: end });
    }
    setProgress(null);
    // Only report success when an actual image was stored. Otherwise the concept
    // exists but no image was generated.
    return wrote > 0 ? "ok" : "no-image";
  }

  // First click: create ideas and render only ONE thumbnail (or a few in Best
  // Quality mode). Cheapest path — no wall of 10 auto-generated thumbnails.
  function handleGenerate() {
    if (!selected) return;
    return withBusy("gen", async () => {
      setProviderLimit(false);
      setConceptPending(false);
      setProviderError(null);
      const ideas = (await gen({
        data: {
          topic: selected.topic,
          script: story?.script,
          angle: research?.storyAngles?.[0],
          ...buildInjection(["thumbnail"]),
        },
      })) as ThumbnailIdea[];
      saveThumbnails({ topicId: selected.id, ideas, generatedAt: Date.now() });
      const status = await renderImages(ideas, 0, Math.min(credit.initialThumbnails, ideas.length), true);
      // Hard gate: only claim "ready" if an actual image URL is now stored.
      const storedUrl = await loadImage(thumbImageId(selected.id, 0));
      if (status === "ok" && storedUrl) {
        toast.success("First thumbnail ready. Not happy? Generate alternatives.");
      } else {
        setConceptPending(true);
        // Show the exact provider error (already set in renderImages) — open the
        // Developer Debug panel (bottom-left) for the full raw response.
        if (providerError) toast.error(providerError);
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
    if (!selected || !pack) return;
    return withBusy(`i-${index}`, async () => {
      setProviderLimit(false);
      const updated = (await regen({ data: { topic: selected.topic, idea: pack.ideas[index] } })) as ThumbnailIdea;
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
    if (!selected) return;
    return withBusy("later", async () => {
      setProviderLimit(false);
      const ideas = (await gen({
        data: {
          topic: selected.topic,
          script: story?.script,
          angle: research?.storyAngles?.[0],
          ...buildInjection(["thumbnail"]),
        },
      })) as ThumbnailIdea[];
      saveThumbnails({ topicId: selected.id, ideas, generatedAt: Date.now() });
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
        <Button onClick={handleGenerate} disabled={!selected || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {pack ? "Regenerate First Thumbnail" : "Generate Thumbnail"}
        </Button>
        <Button variant="secondary" onClick={handleGenerateLater} disabled={!selected || !!busy}>
          {busy === "later" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Clock className="mr-2 h-4 w-4" /> Generate Thumbnail Later
        </Button>
        <Button variant="outline" onClick={() => openUpload(0)} disabled={!selected || !!busy}>
          <Upload className="mr-2 h-4 w-4" /> Upload Thumbnail Manually
        </Button>
        <Button variant="outline" onClick={handlePlaceholder} disabled={!selected || !!busy}>
          <ImageOff className="mr-2 h-4 w-4" /> Use Placeholder Thumbnail
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadFile} />
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
      </div>

      {freeMode && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          Free Queue Mode: generates only 1 thumbnail image and disables multiple variations.
        </p>
      )}

      {providerLimit && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          {PROVIDER_LIMIT_MESSAGE} Completed thumbnails are saved. You can upload one manually or use a placeholder.
        </p>
      )}

      {/* Hard state message: only show "ready" when an actual image URL exists. */}
      {selected && pack && (
        thumbnailReady ? (
          <p className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
            First thumbnail ready. Not happy? Generate alternatives.
          </p>
        ) : (
          <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
            Thumbnail image not generated yet.
          </p>
        )
      )}

      {/* Debug line — reflects the raw thumbnail state, never concept-only. */}
      {selected && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
          <div>Thumbnail Status: {thumbnailStatus}</div>
          <div>Has Image URL: {hasImageUrl ? "true" : "false"}</div>
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
    </StageShell>
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
