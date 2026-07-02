import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Package } from "lucide-react";
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

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "Export — Documentary Studio" }] }),
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

  async function exportAll() {
    if (!selected) return;
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
          const img = await loadImage(sceneImageId(selected.id, s.sceneNumber));
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
      link.download = `${slugify(selected.topic)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Project exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
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
      <h1 className="text-xl font-semibold">Export Manager</h1>
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
├── Script/  (script.md, subtitles.srt)
├── Research/
├── Images/  (001_00-00-00.png, 002_00-00-05.png …)
├── Voice/
├── Thumbnail/
├── SEO/
└── Rating/`}</pre>

          <Button className="mt-5" onClick={exportAll} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
            Export Entire Project
          </Button>
          {progress && <span className="ml-3 text-xs text-muted-foreground">{progress}</span>}
        </>
      )}
    </div>
  );
}
