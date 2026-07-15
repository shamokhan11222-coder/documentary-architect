import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BarChart3, Film, Image as ImageIcon, Mic, Clock, Download as DownloadIcon, Palette, FolderKanban } from "lucide-react";

import { useTopics, useAllStories, useAllVisuals } from "@/lib/store";
import { readLocal } from "@/lib/local";
import type { VoiceProject, VisualScene } from "@/lib/types";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Project Analytics — Stickmax Studio" }] }),
  component: AnalyticsPage,
});

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof BarChart3 }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function AnalyticsPage() {
  const topics = useTopics();
  const stories = useAllStories();
  const visuals = useAllVisuals();
  // Voice: read raw store (avoids needing a per-topic hook loop).
  const voices = readLocal<Record<string, VoiceProject>>("docos.voice", {});

  const stats = useMemo(() => {
    const storyCount = Object.keys(stories).length;
    const visualEntries = Object.values(visuals);
    const totalScenes = visualEntries.reduce((sum, v) => sum + (v?.scenes?.length ?? 0), 0);
    const avgScenes = visualEntries.length ? Math.round(totalScenes / visualEntries.length) : 0;
    const voiceEntries = Object.values(voices);
    const totalVoiceSeconds = voiceEntries.reduce(
      (sum, v) => sum + (v?.blocks?.reduce((a, b) => a + (b.realSeconds ?? b.estSeconds ?? 0), 0) ?? 0),
      0,
    );
    const voiceMinutes = totalVoiceSeconds / 60;
    const totalWords = Object.values(stories).reduce(
      (sum, s) => sum + ((s?.script?.match(/\S+/g) ?? []).length),
      0,
    );
    const avgWords = storyCount ? Math.round(totalWords / storyCount) : 0;
    const avgVideoSeconds = storyCount ? (avgWords / 145) * 60 : 0;

    // Most-used scene type across all visual maps.
    const typeCounts = new Map<string, number>();
    for (const v of visualEntries) {
      for (const s of (v?.scenes ?? []) as VisualScene[]) {
        const t = s.sceneType || "unknown";
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      }
    }
    const topStyle = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    // Most-used voice profile / name across projects.
    const voiceCounts = new Map<string, number>();
    for (const v of voiceEntries) {
      const name = v?.settings?.voiceName || v?.settings?.profile || "unknown";
      voiceCounts.set(name, (voiceCounts.get(name) ?? 0) + 1);
    }
    const topVoice = [...voiceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return {
      projects: topics.length,
      stories: storyCount,
      visuals: visualEntries.length,
      totalScenes,
      avgScenes,
      voiceMinutes,
      avgWords,
      avgVideoSeconds,
      topStyle,
      topVoice,
      completed: topics.filter((t) => t.completed).length,
    };
  }, [topics, stories, visuals, voices]);

  // Weekly / monthly / lifetime buckets from topic.savedAt.
  const now = Date.now();
  const week = topics.filter((t) => now - t.savedAt < 7 * 86400_000).length;
  const month = topics.filter((t) => now - t.savedAt < 30 * 86400_000).length;

  const fmtDuration = (s: number) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Project Analytics</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Real production stats pulled from your projects. Numbers marked "—" mean no data yet.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Projects Created" value={stats.projects} icon={FolderKanban} />
        <Stat label="Videos Completed" value={stats.completed} icon={Film} />
        <Stat label="Stories Generated" value={stats.stories} icon={Film} />
        <Stat label="Storyboards Built" value={stats.visuals} icon={ImageIcon} />
        <Stat label="Images (Scenes)" value={stats.totalScenes} icon={ImageIcon} hint="Sum of scenes across every storyboard" />
        <Stat label="Voice Minutes" value={stats.voiceMinutes ? stats.voiceMinutes.toFixed(1) : "—"} icon={Mic} />
        <Stat label="Avg Scene Count" value={stats.avgScenes || "—"} icon={ImageIcon} />
        <Stat label="Avg Video Length" value={fmtDuration(stats.avgVideoSeconds)} icon={Clock} hint="Estimated from word count @ 145 WPM" />
        <Stat label="Most Used Scene Type" value={stats.topStyle} icon={Palette} />
        <Stat label="Most Used Voice" value={stats.topVoice} icon={Mic} />
        <Stat label="Downloads / Exports" value="—" icon={DownloadIcon} hint="Tracked once exports run" />
        <Stat label="Avg Render Time" value="—" icon={Clock} hint="Tracked once queue completes" />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Timeline</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Weekly</div>
            <div className="mt-1 text-2xl font-bold">{week}</div>
            <div className="text-[11px] text-muted-foreground">projects created</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Monthly</div>
            <div className="mt-1 text-2xl font-bold">{month}</div>
            <div className="text-[11px] text-muted-foreground">projects created</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Lifetime</div>
            <div className="mt-1 text-2xl font-bold">{stats.projects}</div>
            <div className="text-[11px] text-muted-foreground">projects created</div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Provider usage, storage, and export counters wire up once the queue and export pipeline start emitting telemetry — placeholders shown until then, never fake numbers.
      </p>
    </div>
  );
}