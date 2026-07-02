import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileText, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useStory } from "@/lib/store";
import {
  useSubtitles,
  saveSubtitles,
  scriptToParagraphs,
  buildSubtitles,
  fmtTimestamp,
  toSRT,
  toVTT,
  toPlainText,
} from "@/lib/production";
import { downloadTxt, download, slugify } from "@/lib/io";

export const Route = createFileRoute("/subtitles")({
  head: () => ({ meta: [{ title: "Subtitles — Stickmax Studio" }] }),
  component: SubtitlesPage,
});

function SubtitlesPage() {
  const { selected } = useSelectedProject();
  const story = useStory(selected?.id ?? null);
  const pack = useSubtitles(selected?.id ?? null);

  function generate() {
    if (!selected || !story) return;
    const cues = buildSubtitles(scriptToParagraphs(story.script));
    saveSubtitles({ topicId: selected.id, cues, generatedAt: Date.now() });
    toast.success(`${cues.length} subtitles generated`);
  }

  const base = selected ? slugify(selected.topic) : "subtitles";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">Subtitle Generator</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Auto-generate timestamped subtitles from your script. Export as SRT, VTT or TXT.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ProjectPicker />
        <Button onClick={generate} disabled={!selected || !story}>
          <RefreshCw className="mr-2 h-4 w-4" /> {pack ? "Regenerate" : "Generate Subtitles"}
        </Button>
      </div>

      {selected && !story && <p className="mt-4 text-xs text-amber-600">Run the Story Engine first.</p>}

      {pack && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => download(base + ".srt", toSRT(pack.cues), "text/plain")}>
              Export SRT
            </Button>
            <Button size="sm" variant="secondary" onClick={() => download(base + ".vtt", toVTT(pack.cues), "text/vtt")}>
              Export VTT
            </Button>
            <Button size="sm" variant="secondary" onClick={() => downloadTxt(base, toPlainText(pack.cues))}>
              Export TXT
            </Button>
            <span className="self-center text-xs text-muted-foreground">{pack.cues.length} cues</span>
          </div>

          <div className="mt-4 divide-y divide-border rounded-xl border border-border">
            {pack.cues.map((c) => (
              <div key={c.index} className="flex gap-4 p-3 text-sm">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">{c.index}</span>
                <span className="w-40 shrink-0 font-mono text-[11px] text-muted-foreground">
                  {fmtTimestamp(c.start)} → {fmtTimestamp(c.end)} ({c.duration}s)
                </span>
                <FileText className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
