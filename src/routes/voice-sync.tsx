import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useVisualMap, saveVisualMap } from "@/lib/store";
import { useVoice } from "@/lib/production";
import { fmtClock, fmtTimestamp } from "@/lib/production";
import { useImage, loadImage } from "@/lib/images";
import { voiceBlockId } from "@/lib/generate-voice";
import {
  buildSyncTimeline,
  deleteSyncTimeline,
  mergeWithNext,
  saveSyncTimeline,
  setSceneBoundary,
  splitScene,
  timelineToTimingJSON,
  toggleSceneLock,
  useSyncTimeline,
  validateTimeline,
  type SyncMode,
  type SyncScene,
  type SyncTimeline,
} from "@/lib/voice-sync";

export const Route = createFileRoute("/voice-sync")({
  head: () => ({ meta: [{ title: "Voice Sync — Stickmax Studio" }] }),
  component: VoiceSyncPage,
});

type Filter = "all" | "ready" | "missing" | "long" | "short" | "unmapped" | "locked";

function VoiceSyncPage() {
  const { selected } = useSelectedProject();
  const map = useVisualMap(selected?.id ?? null);
  const voice = useVoice(selected?.id ?? null);
  const stored = useSyncTimeline(selected?.id ?? null);

  const [mode, setMode] = useState<SyncMode>("auto");
  const [customTarget, setCustomTarget] = useState(3.0);
  const [filter, setFilter] = useState<Filter>("all");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, setPending] = useState<SyncTimeline | null>(null);
  const [imageIds, setImageIds] = useState<Set<number>>(new Set());

  const scenes = map ? [...map.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber) : [];

  // Determine which scene images actually exist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected || !scenes.length) { setImageIds(new Set()); return; }
      const results = await Promise.all(
        scenes.map((s) => loadImage(`scene:${selected.id}:${s.sceneNumber}`).then((v) => [s.sceneNumber, !!v] as const)),
      );
      if (cancelled) return;
      setImageIds(new Set(results.filter(([, ok]) => ok).map(([n]) => n)));
    })();
    return () => { cancelled = true; };
  }, [selected?.id, map?.generatedAt, scenes.length]);

  const active = pending ?? stored;

  const canRun = !!(selected && map && voice && voice.blocks.length && scenes.length);

  function runSync() {
    if (!selected || !map || !voice) return;
    const { timeline, warnings } = buildSyncTimeline({
      projectId: selected.id,
      voice,
      scenes,
      hasImage: (n) => imageIds.has(n),
      options: { mode, customTarget },
      previous: stored,
    });
    setPending(timeline);
    setWarnings(warnings);
  }

  function saveSync() {
    if (!active) return;
    const v = validateTimeline(active);
    if (!v.ok) {
      toast.error(`Cannot save: ${v.errors[0]}`);
      return;
    }
    saveSyncTimeline(active);
    setPending(null);
    toast.success("Sync saved");
  }

  function resetSync() {
    if (!selected) return;
    deleteSyncTimeline(selected.id);
    setPending(null);
    setWarnings([]);
    toast.success("Sync cleared");
  }

  function exportJSON() {
    if (!active) return;
    const blob = new Blob([timelineToTimingJSON(active)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-sync-${active.projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const validation = active ? validateTimeline(active) : null;
  const displayScenes = useMemo(() => {
    if (!active) return [];
    return active.scenes.filter((s) => {
      switch (filter) {
        case "ready": return !s.missingImage;
        case "missing": return s.missingImage;
        case "long": return s.duration > 4;
        case "short": return s.duration > 0 && s.duration < 1.8;
        case "unmapped": return s.duration <= 0.001;
        case "locked": return !!s.locked;
        default: return true;
      }
    });
  }, [active, filter]);

  const stats = active ? computeStats(active) : null;

  // Recommended scenes: aim for average of 3s per scene → total/3.
  const recommendedScenes = active ? Math.max(1, Math.round(active.totalDuration / 3)) : 0;
  const tooFew = !!(stats && stats.avg > 4.0 && recommendedScenes > stats.total);

  function createExtraSlots() {
    if (!selected || !map) return;
    const needed = recommendedScenes - (stats?.total ?? 0);
    if (needed <= 0) return;
    const nextNum = (map.scenes.reduce((m, s) => Math.max(m, s.sceneNumber), 0)) + 1;
    const slots = Array.from({ length: needed }).map((_, i) => ({
      sceneNumber: nextNum + i,
      voiceoverLine: "",
      visualDescription: "Additional pacing slot — no image required.",
      mainSubject: "",
      background: "",
      cameraShot: "",
      emotion: "",
      objectsNeeded: [],
      sceneType: "abstract concept" as const,
      visualDifficulty: "easy",
      notes: "Auto-added by Voice Sync for smooth pacing.",
    }));
    saveVisualMap({ ...map, scenes: [...map.scenes, ...slots], generatedAt: Date.now() });
    toast.success(`Added ${needed} scene slot${needed === 1 ? "" : "s"}. Recalculate to apply.`);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Voice Sync</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Align storyboard scenes to your generated narration. 100% local — no AI calls.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ProjectPicker />
      </div>

      {!canRun && selected && (
        <p className="mt-4 text-sm text-amber-600">
          Need both a storyboard (Images) and generated voice blocks (Voice) to sync.
        </p>
      )}

      {canRun && (
        <>
          {/* Mode + actions */}
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {(["auto", "fast", "balanced", "slow", "custom"] as SyncMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={["rounded-md border px-3 py-1.5 capitalize transition-colors",
                    mode === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"].join(" ")}
                >{m === "auto" ? "Auto Sync" : m === "fast" ? "Fast Visuals" : m}</button>
              ))}
            </div>
            {mode === "custom" && (
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Avg (s)</span>
                <input
                  type="number" min={1.5} max={6} step={0.1}
                  value={customTarget}
                  onChange={(e) => setCustomTarget(Number(e.target.value) || 3)}
                  className="w-20 rounded border border-input bg-background px-2 py-1"
                />
              </label>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={runSync} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                {stored ? "Recalculate" : "Auto Sync"}
              </button>
              <button onClick={saveSync} disabled={!pending} className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40">Save Sync</button>
              <button onClick={exportJSON} disabled={!active} className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40">Export Timing JSON</button>
              <button onClick={resetSync} disabled={!stored} className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40">Reset Sync</button>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
              <Stat label="Narration" value={fmtClock(stats.totalDuration)} />
              <Stat label="Voice blocks" value={`${active!.voiceBlocks.length}`} />
              <Stat label="Scenes" value={`${stats.total}`} />
              <Stat label="Images ready" value={`${stats.ready}/${stats.total}`} />
              <Stat label="Missing" value={`${stats.missing}`} />
              <Stat label="Avg length" value={`${stats.avg.toFixed(2)}s`} />
              <Stat label="Coverage" value={`${Math.round((validation?.coverage ?? 0) * 100)}%`} />
              <Stat label="Shortest" value={`${stats.min.toFixed(2)}s`} />
              <Stat label="Longest" value={`${stats.max.toFixed(2)}s`} />
              <Stat label="Unmapped" value={`${stats.unmapped}`} />
              <Stat label="Gaps" value={`${validation?.warnings.filter(w => w.includes("Gap")).length ?? 0}`} />
              <Stat label="Status" value={validation?.ok ? (pending ? "Preview" : "Saved") : "Warnings"} />
              <Stat label="Mode" value={active!.mode} />
            </div>
          )}

          {tooFew && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <div className="flex-1">
                <div className="font-medium text-amber-700">More scene slots are required for smooth visual pacing.</div>
                <div className="mt-0.5 text-muted-foreground">
                  Current {stats!.total} · Recommended {recommendedScenes} · Narration {fmtClock(stats!.totalDuration)} · Avg {stats!.avg.toFixed(2)}s (target ~3.0s)
                </div>
              </div>
              <button onClick={createExtraSlots} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
                Create Additional Scene Slots
              </button>
            </div>
          )}

          {/* Warnings */}
          {(warnings.length > 0 || (validation && (validation.errors.length || validation.warnings.length))) && (
            <div className="mt-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              {warnings.map((w, i) => <div key={`w${i}`} className="text-amber-700">• {w}</div>)}
              {validation?.errors.map((e, i) => <div key={`e${i}`} className="text-destructive">✗ {e}</div>)}
              {validation?.warnings.map((w, i) => <div key={`vw${i}`} className="text-amber-700">! {w}</div>)}
            </div>
          )}

          {/* Preview player */}
          {active && <PreviewPlayer timeline={active} topicId={selected!.id} />}

          {/* Filter */}
          {active && (
            <div className="mt-5 flex flex-wrap items-center gap-1 text-xs">
              {(["all", "ready", "missing", "long", "short", "unmapped", "locked"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={["rounded-md border px-2.5 py-1 capitalize transition-colors",
                    filter === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"].join(" ")}
                >{f === "missing" ? "Missing image" : f === "long" ? "Long duration" : f === "short" ? "Short duration" : f}</button>
              ))}
              <span className="ml-2 text-muted-foreground">{displayScenes.length} shown</span>
            </div>
          )}

          {/* Timeline strip */}
          {active && <TimelineStrip timeline={active} topicId={selected!.id} />}

          {/* Scene list */}
          {active && (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border">
              {displayScenes.map((s) => (
                <SceneRow
                  key={s.sceneNumber}
                  topicId={selected!.id}
                  scene={s}
                  onLock={() => { const t = toggleSceneLock(active, s.sceneNumber); setPending(t); }}
                  onSplit={() => { const t = splitScene(active, s.sceneNumber); setPending(t); }}
                  onMerge={() => { const t = mergeWithNext(active, s.sceneNumber); setPending(t); }}
                  onEndChange={(v) => { const t = setSceneBoundary(active, s.sceneNumber, v); setPending(t); }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function computeStats(t: SyncTimeline) {
  const total = t.scenes.length;
  const ready = t.scenes.filter((s) => !s.missingImage).length;
  const missing = total - ready;
  const durs = t.scenes.map((s) => s.duration).filter((d) => d > 0);
  const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  const min = durs.length ? Math.min(...durs) : 0;
  const max = durs.length ? Math.max(...durs) : 0;
  const unmapped = total - durs.length;
  return { total, ready, missing, avg, min, max, unmapped, totalDuration: t.totalDuration };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function TimelineStrip({ timeline, topicId: _topicId }: { timeline: SyncTimeline; topicId: string }) {
  const total = timeline.totalDuration || 1;
  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <div className="text-xs font-medium text-muted-foreground">Voice blocks</div>
      <div className="mt-1 flex h-4 w-full overflow-hidden rounded bg-muted">
        {timeline.voiceBlocks.map((b) => (
          <div key={b.blockIndex} title={`Block ${b.blockIndex}: ${b.duration.toFixed(2)}s`}
            style={{ width: `${(b.duration / total) * 100}%` }}
            className="border-r border-background bg-primary/40" />
        ))}
      </div>
      <div className="mt-3 text-xs font-medium text-muted-foreground">Scenes</div>
      <div className="mt-1 flex h-6 w-full overflow-hidden rounded bg-muted">
        {timeline.scenes.map((s) => (
          <div key={s.sceneNumber} title={`Scene ${s.sceneNumber}: ${s.duration.toFixed(2)}s`}
            style={{ width: `${(Math.max(0.01, s.duration) / total) * 100}%` }}
            className={[
              "border-r border-background text-[9px] leading-6 text-center text-primary-foreground/90",
              s.missingImage ? "bg-amber-500/60" : s.locked ? "bg-emerald-500/70" : "bg-primary/70",
            ].join(" ")}
          >{s.sceneNumber}</div>
        ))}
      </div>
    </div>
  );
}

function SceneRow({
  topicId, scene, onLock, onSplit, onMerge, onEndChange,
}: {
  topicId: string;
  scene: SyncScene;
  onLock: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onEndChange: (v: number) => void;
}) {
  const img = useImage(`scene:${topicId}:${scene.sceneNumber}`);
  return (
    <div className="flex items-center gap-3 p-2 text-sm">
      <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTimestamp(scene.start, ".").slice(0, 8)}</span>
      <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
        {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : (
          <div className="flex h-full items-center justify-center text-[9px] text-amber-600">Missing</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate"><span className="font-medium">#{scene.sceneNumber}</span> {scene.narrationText}</div>
        <div className="text-[10px] text-muted-foreground">Block {scene.voiceBlockStart} · {scene.duration.toFixed(2)}s {scene.locked && "· locked"} {scene.manual && "· manual"}</div>
      </div>
      <input
        type="number" step={0.1} min={scene.start + 0.5}
        value={Number(scene.end.toFixed(2))}
        onChange={(e) => onEndChange(Number(e.target.value))}
        className="w-20 shrink-0 rounded border border-input bg-background px-2 py-1 text-xs"
        title="Scene end (seconds)"
      />
      <button onClick={onLock} className="rounded border border-input px-2 py-1 text-[10px] hover:bg-accent">{scene.locked ? "Unlock" : "Lock"}</button>
      <button onClick={onSplit} className="rounded border border-input px-2 py-1 text-[10px] hover:bg-accent">Split</button>
      <button onClick={onMerge} className="rounded border border-input px-2 py-1 text-[10px] hover:bg-accent">Merge→</button>
    </div>
  );
}

// ---------------- Preview Player ----------------

function PreviewPlayer({ timeline, topicId }: { timeline: SyncTimeline; topicId: string }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  // Load one HTMLAudioElement per voice block from IndexedDB.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const els: HTMLAudioElement[] = [];
      for (const b of timeline.voiceBlocks) {
        const url = await loadImage(voiceBlockId(topicId, b.blockIndex));
        if (!url) continue;
        const a = new Audio(url);
        a.preload = "auto";
        els.push(a);
      }
      if (!cancelled) { audiosRef.current = els; setReady(els.length === timeline.voiceBlocks.length); }
    })();
    return () => {
      cancelled = true;
      audiosRef.current.forEach((a) => { a.pause(); a.src = ""; });
      audiosRef.current = [];
    };
  }, [topicId, timeline.voiceBlocks.length]);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const currentScene = timeline.scenes.find((s) => t >= s.start && t < s.end) ?? timeline.scenes[0];
  const currentImg = useImage(currentScene ? `scene:${topicId}:${currentScene.sceneNumber}` : null);

  async function play() {
    if (!ready) { toast.info("Loading narration…"); return; }
    setPlaying(true);
    const start = performance.now() - t * 1000;
    const step = () => {
      const now = (performance.now() - start) / 1000;
      if (now >= timeline.totalDuration) { setT(timeline.totalDuration); setPlaying(false); stopAll(); return; }
      setT(now);
      const idx = findBlock(timeline, now);
      if (idx >= 0) {
        const b = timeline.voiceBlocks[idx];
        const a = audiosRef.current[idx];
        if (a) {
          if (a.paused) { a.currentTime = Math.max(0, now - b.start); a.play().catch(() => {}); }
          // Pause other audios.
          audiosRef.current.forEach((x, i) => { if (i !== idx && !x.paused) x.pause(); });
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function stopAll() {
    audiosRef.current.forEach((a) => { a.pause(); a.currentTime = 0; });
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  function pause() { setPlaying(false); audiosRef.current.forEach((a) => a.pause()); if (rafRef.current) cancelAnimationFrame(rafRef.current); }
  function restart() { pause(); setT(0); setTimeout(() => play(), 30); }

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-border p-3 lg:grid-cols-[280px_1fr]">
      <div className="aspect-video overflow-hidden rounded bg-muted">
        {currentImg ? <img src={currentImg} alt="" className="h-full w-full object-cover" /> : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2">
          {playing
            ? <button onClick={pause} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Pause</button>
            : <button onClick={play} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Play</button>}
          <button onClick={restart} className="rounded border border-input px-3 py-1.5 text-xs">Restart</button>
          <span className="ml-2 font-mono text-xs text-muted-foreground">{fmtTimestamp(t, ".").slice(0, 8)} / {fmtTimestamp(timeline.totalDuration, ".").slice(0, 8)}</span>
          <span className="ml-auto text-xs">Scene {currentScene?.sceneNumber ?? "—"}</span>
        </div>
        <input
          type="range" min={0} max={timeline.totalDuration} step={0.1}
          value={t}
          onChange={(e) => { const v = Number(e.target.value); setT(v); if (playing) restart(); }}
          className="mt-3 w-full"
        />
        {!ready && <p className="mt-2 text-[11px] text-muted-foreground">Loading narration audio…</p>}
      </div>
    </div>
  );
}

function findBlock(t: SyncTimeline, time: number): number {
  for (let i = 0; i < t.voiceBlocks.length; i++) {
    const b = t.voiceBlocks[i];
    if (time >= b.start && time < b.end) return i;
  }
  return -1;
}