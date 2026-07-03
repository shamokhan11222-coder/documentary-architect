import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { generateSeo, regenerateTitles } from "@/lib/ai.functions";
import {
  useTopics,
  useSelectedTopicId,
  setSelectedTopicId,
  useStory,
  useSeo,
  saveSeo,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StageShell } from "@/components/StageShell";
import { copyText, downloadTxt, slugify } from "@/lib/io";
import type { Seo } from "@/lib/types";
import { humanizeError } from "@/lib/humanize-error";

export const Route = createFileRoute("/seo")({
  head: () => ({ meta: [{ title: "SEO — Stickmax Studio" }] }),
  component: SeoPage,
});

function seoToText(s: Seo): string {
  return [
    "TITLE OPTIONS:",
    ...s.titleOptions.map((t, i) => `${i + 1}. ${t}`),
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
    ...(s.uploadChecklist ?? []).map((c) => `- ${c}`),
  ].join("\n");
}

function SeoPage() {
  const topics = useTopics();
  const selectedId = useSelectedTopicId();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const story = useStory(selectedId);
  const seo = useSeo(selectedId);

  const gen = useServerFn(generateSeo);
  const regenT = useServerFn(regenerateTitles);
  const [busy, setBusy] = useState<string | null>(null);

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

  function handleGenerate() {
    if (!selected) return;
    return withBusy("gen", async () => {
      const data = (await gen({
        data: { topic: selected.topic, script: story?.script },
      })) as Omit<Seo, "topicId" | "generatedAt">;
      // Never blank existing fields: fall back to the previous SEO (or safe
      // empties) for anything the model left missing.
      const arr = (next?: string[], prev?: string[]) =>
        Array.isArray(next) && next.length ? next : (prev ?? []);
      const str = (next?: string, prev?: string) =>
        typeof next === "string" && next.trim() ? next : (prev ?? "");
      const merged: Seo = {
        topicId: selected.id,
        generatedAt: Date.now(),
        titleOptions: arr(data.titleOptions, seo?.titleOptions),
        bestTitle: str(data.bestTitle, seo?.bestTitle),
        description: str(data.description, seo?.description),
        tags: arr(data.tags, seo?.tags),
        hashtags: arr(data.hashtags, seo?.hashtags),
        keywords: arr(data.keywords, seo?.keywords),
        pinnedComment: str(data.pinnedComment, seo?.pinnedComment),
        shortSummary: str(data.shortSummary, seo?.shortSummary),
        longSummary: str(data.longSummary, seo?.longSummary),
        uploadChecklist: arr(data.uploadChecklist, seo?.uploadChecklist),
      };
      saveSeo(merged);
      toast.success("SEO generated");
    });
  }

  function handleRegenTitles() {
    if (!selected || !seo) return;
    return withBusy("titles", async () => {
      const { titleOptions, bestTitle } = await regenT({
        data: { topic: selected.topic, script: story?.script },
      });
      saveSeo({ ...seo, titleOptions, bestTitle, generatedAt: Date.now() });
      toast.success("Titles regenerated");
    });
  }

  function update(patch: Partial<Seo>) {
    if (!seo) return;
    saveSeo({ ...seo, ...patch });
  }

  return (
    <StageShell stage="seo" maxWidth="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">SEO Engine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload-ready YouTube metadata for the selected topic.
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
        <Button onClick={handleGenerate} disabled={!selected || !!busy}>
          {busy === "gen" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {seo ? "Regenerate SEO" : "Generate SEO"}
        </Button>
      </div>

      {!selected && (
        <p className="mt-6 text-sm text-muted-foreground">Select a topic to start.</p>
      )}

      {seo && selected && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleRegenTitles} disabled={!!busy}>
              {busy === "titles" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Regenerate Titles
            </Button>
            <Button size="sm" variant="secondary" onClick={() => copyText(seo.description, "Description copied")}>
              Copy Description
            </Button>
            <Button size="sm" variant="secondary" onClick={() => copyText(seo.tags.join(", "), "Tags copied")}>
              Copy Tags
            </Button>
            <Button size="sm" variant="secondary" onClick={() => copyText(seoToText(seo), "All SEO copied")}>
              Copy All SEO
            </Button>
            <Button size="sm" onClick={() => downloadTxt(slugify(selected.topic) + "-seo", seoToText(seo))}>
              Download TXT
            </Button>
          </div>

          <Card title="Best Title">
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={seo.bestTitle}
              onChange={(e) => update({ bestTitle: e.target.value })}
            />
          </Card>

          <Card title="Title Options">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {seo.titleOptions.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </Card>

          <EditableCard label="Description" value={seo.description} rows={8} onChange={(v) => update({ description: v })} />

          <Card title="Tags">
            <p className="text-sm">{seo.tags.join(", ")}</p>
          </Card>
          <Card title="Hashtags">
            <p className="text-sm">{seo.hashtags.join(" ")}</p>
          </Card>
          <Card title="Keywords">
            <p className="text-sm">{seo.keywords.join(", ")}</p>
          </Card>

          <EditableCard label="Pinned Comment" value={seo.pinnedComment} rows={3} onChange={(v) => update({ pinnedComment: v })} />
          <EditableCard label="Short Summary" value={seo.shortSummary} rows={2} onChange={(v) => update({ shortSummary: v })} />
          <EditableCard label="Long Summary" value={seo.longSummary} rows={5} onChange={(v) => update({ longSummary: v })} />

          <Card title="Upload Checklist">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {(seo.uploadChecklist ?? []).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </StageShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function EditableCard({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  return (
    <Card title={label}>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Card>
  );
}
