import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Package, FileVideo } from "lucide-react";
import JSZip from "jszip";

import { Button } from "@/components/ui/button";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import {
  useStory,
  useResearch,
  useVisualMap,
  useSeo,
  useRating,
  useThumbnails,
} from "@/lib/store";
import {
  useVoice,
  useSubtitles,
  scriptToParagraphs,
  buildSubtitles,
  fmtTimestamp,
  toSRT,
  estimateSeconds,
} from "@/lib/production";
import { loadImage } from "@/lib/images";
import { voiceBlockId } from "@/lib/generate-voice";
import { slugify } from "@/lib/io";
import type { Seo, RatingReport } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";
import { makePlaceholderImage } from "@/lib/image-queue";

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "Export — Stickmax Studio" }] }),
  component: ExportPage,
});

const sceneImageId = (topicId: string, n: number) => `scene:${topicId}:${n}`;
const thumbImageId = (topicId: string, i: number) => `thumb:${topicId}:${i}`;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function stamp(sec: number): string {
  return fmtTimestamp(sec).slice(0, 8).replace(/:/g, "-");
}

function seoToText(s: Seo): string {
  return [
    "TITLE OPTIONS:",
    ...s.titleOptions.map((t, i) => `  ${i + 1}. ${t}`),
    "",
    `BEST TITLE: ${s.bestTitle}`,
    "",
    "DESCRIPTION:",
    s.description,
    "",
    `TAGS: ${s.tags.join(", ")}`,
    `HASHTAGS: ${s.hashtags.join(" ")}`,
    `KEYWORDS: ${s.keywords.join(", ")}`,
    "",
    "PINNED COMMENT:",
    s.pinnedComment,
    "",
    "SHORT SUMMARY:",
    s.shortSummary,
    "",
    "LONG SUMMARY:",
    s.longSummary,
    "",
    "UPLOAD CHECKLIST:",
    ...(s.uploadChecklist ?? []).map((c) => `  - ${c}`),
  ].join("\n");
}

function ratingToText(r: RatingReport): string {
  return [
    `OVERALL SCORE: ${r.overallScore}/10  (${r.recommendation})`,
    "",
    "SCORES:",
    `  Hook: ${r.hookScore}/10`,
    `  Story: ${r.storyScore}/10`,
    `  Retention: ${r.retentionScore}/10`,
    `  Visual clarity: ${r.visualClarityScore}/10`,
    `  Thumbnail CTR: ${r.thumbnailCtrScore}/10`,
    `  Originality: ${r.originalityScore}/10`,
    `  Evergreen: ${r.evergreenScore}/10`,
    "",
    `CTR PREDICTION: ${r.ctrPrediction}`,
    `RETENTION PREDICTION: ${r.retentionPrediction}`,
    "",
    `BEST PART: ${r.bestPart}`,
    `WEAKEST PART: ${r.weakestPart}`,
    "",
    "STRONG POINTS:",
    ...(r.strongPoints ?? []).map((p) => `  + ${p}`),
    "",
    "WEAK POINTS:",
    ...(r.weakPoints ?? []).map((p) => `  - ${p}`),
    "",
    "WHAT TO IMPROVE:",
    ...(r.whatToImprove ?? []).map((p) => `  * ${p}`),
  ].join("\n");
}

function ExportPage() {
  const { selected } = useSelectedProject();
  const id = selected?.id ?? null;
  const research = useResearch(id);
  const story = useStory(id);
  const map = useVisualMap(id);
  const seo = useSeo(id);
  const rating = useRating(id);
  const thumbs = useThumbnails(id);
  const voice = useVoice(id);
  const subs = useSubtitles(id);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [imageStats, setImageStats] = useState<{ have: number; missing: number; total: number }>({
    have: 0, missing: 0, total: 0,
  });

  // Live count of which scene images actually exist in storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected || !map) { setImageStats({ have: 0, missing: 0, total: 0 }); return; }
      let have = 0;
      for (const s of map.scenes) {
        const img = await loadImage(sceneImageId(selected.id, s.sceneNumber));
        if (typeof img === "string" && img.length > 16) have++;
      }
      if (!cancelled) setImageStats({ have, missing: map.scenes.length - have, total: map.scenes.length });
    })();
    return () => { cancelled = true; };
  }, [selected, map, busy]);

  async function exportAll(mode: "full" | "draft") {
    if (!selected) return;
    if (mode === "full" && imageStats.missing > 0) {
      toast.error(`Full Export blocked: ${imageStats.missing} scene image(s) missing.`);
      return;
    }
    setBusy(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(slugify(selected.topic))!;

      // script.txt
      if (story) root.file("script.txt", story.script);
      // research.txt (kept as an extra reference file)
      if (research) root.file("research.txt", JSON.stringify(research, null, 2));

      // Total voiceover duration drives the timeline. Prefer real generated
      // durations; fall back to per-block estimates when voice isn't generated.
      const totalVoice = voice?.blocks.length
        ? voice.blocks.reduce((sum, b) => sum + (b.realSeconds ?? b.estSeconds ?? 0), 0)
        : 0;

      // storyboard.json + images/ with scene-number + timestamp filenames
      let placeholderCount = 0;
      if (map) {
        root.file("storyboard.json", JSON.stringify(map.scenes, null, 2));
        const imagesDir = root.folder("images")!;
        const scenes = [...map.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

        // Per-scene estimated seconds, then scale to real voiceover duration
        // when a voiceover exists so timestamps match the narration.
        const estPerScene = scenes.map((s) => estimateSeconds(s.voiceoverLine));
        const estTotal = estPerScene.reduce((a, b) => a + b, 0) || 1;
        const scale = totalVoice > 0 ? totalVoice / estTotal : 1;

        let clock = 0;
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          setProgress(`Image ${i + 1}/${scenes.length}`);
          let img = await loadImage(sceneImageId(selected.id, s.sceneNumber));
          if (!img && mode === "draft") {
            img = makePlaceholderImage(s.sceneNumber, "Missing image — placeholder");
            placeholderCount++;
          }
          if (img) {
            const name = `${String(s.sceneNumber).padStart(3, "0")}_${stamp(clock)}.png`;
            imagesDir.file(name, dataUrlToBytes(img));
          }
          clock += estPerScene[i] * scale;
        }
      }

      // voiceover.mp3 — all generated blocks concatenated into one file
      if (voice?.blocks.length) {
        const chunks: Uint8Array[] = [];
        for (const b of [...voice.blocks].sort((a, b) => a.index - b.index)) {
          const a = await loadImage(voiceBlockId(selected.id, b.index));
          if (a) chunks.push(dataUrlToBytes(a));
        }
        if (chunks.length) {
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            merged.set(c, off);
            off += c.length;
          }
          root.file("voiceover.mp3", merged);
        }
      }

      // subtitles.srt
      const cues = subs?.cues ?? (story ? buildSubtitles(scriptToParagraphs(story.script)) : []);
      if (cues.length) root.file("subtitles.srt", toSRT(cues));

      // thumbnail.png — the chosen thumbnail (or the first available)
      if (thumbs?.ideas.length) {
        const chosenIdx = Math.max(0, thumbs.ideas.findIndex((t) => t.chosen));
        let thumbImg = await loadImage(thumbImageId(selected.id, chosenIdx));
        if (!thumbImg) {
          for (let i = 0; i < thumbs.ideas.length; i++) {
            thumbImg = await loadImage(thumbImageId(selected.id, i));
            if (thumbImg) break;
          }
        }
        if (thumbImg) root.file("thumbnail.png", dataUrlToBytes(thumbImg));
      }

      // seo.txt
      if (seo) root.file("seo.txt", seoToText(seo));
      // rating.txt
      if (rating) root.file("rating.txt", ratingToText(rating));

      setProgress("Zipping…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slugify(selected.topic)}${mode === "draft" ? "-draft" : ""}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(
        mode === "draft"
          ? `Draft exported (${placeholderCount} placeholder image${placeholderCount === 1 ? "" : "s"}).`
          : "Project exported",
      );
    } catch (e) {
      toast.error(humanizeError(e, "Export failed"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const parts = [
    ["Script", !!story],
    ["Research", !!research],
    ["Storyboard", !!map],
    ["Images", !!map],
    ["Voiceover", !!voice?.blocks.length],
    ["Thumbnail", !!thumbs],
    ["SEO", !!seo],
    ["Rating Report", !!rating],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Export Manager</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Export the entire project into one organized folder — script, research, images (timestamped), voice, thumbnail, SEO and rating.
      </p>

      <div className="mt-4"><ProjectPicker /></div>

      {selected && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {parts.map(([label, ready]) => (
              <div key={label} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                <span className={["h-2 w-2 rounded-full", ready ? "bg-green-500" : "bg-muted-foreground/40"].join(" ")} />
                {label}
              </div>
            ))}
          </div>

          <pre className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">{`${slugify(selected.topic)}/
├── script.txt
├── voiceover.mp3
├── thumbnail.png
├── seo.txt
├── storyboard.json
├── images/  (001_00-00-00.png, 002_00-00-05.png …)
├── subtitles.srt
└── rating.txt`}</pre>

          <div className="mt-5 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
            <div><span className="font-semibold">Images:</span> {imageStats.have} / {imageStats.total}</div>
            <div><span className="font-semibold">Missing:</span> <span className={imageStats.missing ? "text-amber-600" : ""}>{imageStats.missing}</span></div>
            <div><span className="font-semibold">Full Export:</span> {imageStats.missing === 0 && imageStats.total > 0 ? <span className="text-green-600">ready</span> : <span className="text-red-600">blocked</span>}</div>
            <div><span className="font-semibold">Draft Export:</span> <span className="text-green-600">ready</span></div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => exportAll("full")}
              disabled={busy || imageStats.missing > 0 || imageStats.total === 0}
              title={imageStats.missing > 0 ? `Blocked: ${imageStats.missing} missing image(s)` : "Export the full project"}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
              Full Export
            </Button>
            <Button variant="outline" onClick={() => exportAll("draft")} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileVideo className="mr-2 h-4 w-4" />}
              Draft Export {imageStats.missing > 0 && `(${imageStats.missing} placeholder${imageStats.missing === 1 ? "" : "s"})`}
            </Button>
            {progress && <span className="ml-2 text-xs text-muted-foreground">{progress}</span>}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Draft Export uses neutral placeholders for any missing scene images so you can preview the full timeline immediately.
            Full Export unlocks once every scene has a generated image.
          </p>
        </>
      )}
    </div>
  );
}
