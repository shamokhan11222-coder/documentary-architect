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
  classifyTimeline,
  deleteSyncTimeline,
  mergeWithNext,
  readSyncTimeline,
  repairTimeline,
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

type TimelineHealth = {
  validation: ReturnType<typeof validateTimeline>;
  classified: ReturnType<typeof classifyTimeline>;
  gaps: number;
  longScenes: SyncScene[];
  overlaps: number;
  unmapped: number;
  ready: boolean;
};

type RepairCheck = {
  source: "recalculate" | "repair" | "force" | "auto" | "save";
  validation: ReturnType<typeof validateTimeline>;
  gaps: number;
  longScenes: { sceneId: string; sceneNumber: number; duration: number }[];
  overlaps: number;
  unmapped: number;
};

function summarizeTimeline(t: SyncTimeline): TimelineHealth {
  const validation = validateTimeline(t);
  const classified = classifyTimeline(t);
  const longScenes = classified.autoFixable.longScenes;
  const gaps = classified.autoFixable.gaps.length;
  const overlaps = t.scenes.slice(1).filter((s, index) => s.start + 0.001 < t.scenes[index].end).length;
  const unmapped = t.scenes.filter((s) => s.duration <= 0.001).length;
  return {
    validation,
    classified,
    gaps,
    longScenes,
    overlaps,
    unmapped,
    ready: validation.errors.length === 0 && gaps === 0 && longScenes.length === 0 && overlaps === 0 && unmapped === 0,
  };
}

function toRepairCheck(
  source: RepairCheck["source"],
  health: TimelineHealth,
): RepairCheck {
  return {
    source,
    validation: health.validation,
    gaps: health.gaps,
    longScenes: health.longScenes.map((s) => ({
      sceneId: s.sceneId,
      sceneNumber: s.sceneNumber,
      duration: s.duration,
    })),
    overlaps: health.overlaps,
    unmapped: health.unmapped,
  };
}

function formatLongScenes(longScenes: RepairCheck["longScenes"]) {
  return longScenes.map((s) => `${s.sceneId} (${s.duration.toFixed(2)}s)`).join(", ");
}

function logDurationRepair(summary: ReturnType<typeof repairTimeline>["summary"]) {
  console.info("[Voice Sync Duration Repair]", {
    longSceneIdsBeforeRepair: summary.longScenesBefore.map((s) => s.sceneId),
    durationBefore: summary.longScenesBefore.map((s) => ({ sceneId: s.sceneId, duration: s.duration })),
    createdChildSceneIds: summary.splitDetails.map((d) => ({
      originalSceneId: d.originalSceneId,
      children: d.children.map((c) => c.sceneId),
    })),
    childDurations: summary.splitDetails.map((d) => ({
      originalSceneId: d.originalSceneId,
      children: d.children.map((c) => ({ sceneId: c.sceneId, duration: c.duration })),
    })),
    maxFinalDuration: summary.maxFinalDuration,
    totalTimelineDifference: summary.totalTimelineDifference,
  });
}

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
  const [appliedTimeline, setAppliedTimeline] = useState<SyncTimeline | null>(null);
  const [repairCheck, setRepairCheck] = useState<RepairCheck | null>(null);
  const [imageIds, setImageIds] = useState<Set<number>>(new Set());
  const autoRepairKey = useRef<string | null>(null);

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

  useEffect(() => {
    setPending(null);
    setAppliedTimeline(null);
    setRepairCheck(null);
    autoRepairKey.current = null;
  }, [selected?.id]);

  const active = pending ?? appliedTimeline ?? stored;

  const canRun = !!(selected && map && voice && voice.blocks.length && scenes.length);

  function persistAppliedTimeline(
    timeline: SyncTimeline,
    source: RepairCheck["source"],
  ): { timeline: SyncTimeline; health: TimelineHealth; check: RepairCheck } {
    const validation = validateTimeline(timeline);
    saveSyncTimeline(timeline);
    const reloaded = readSyncTimeline(timeline.projectId) ?? timeline;
    const health = summarizeTimeline(reloaded);
    const check = toRepairCheck(source, { ...health, validation });
    setAppliedTimeline(reloaded);
    setPending(null);
    setRepairCheck(check);
    return { timeline: reloaded, health, check };
  }

  function applyRepairTimeline(
    currentTimeline: SyncTimeline,
    source: "recalculate" | "repair" | "force" | "auto",
  ) {
    const result = repairTimeline(currentTimeline);
    const validation = validateTimeline(result.timeline);
    const saved = persistAppliedTimeline(result.timeline, source);
    logDurationRepair(result.summary);
    if (saved.check.longScenes.length > 0) {
      toast.error(`Repair saved, but long scenes remain: ${formatLongScenes(saved.check.longScenes)}`);
    } else if (saved.health.ready) {
      toast.success("Voice Sync Complete");
    } else {
      toast.warning(
        `${saved.health.gaps} gap(s) remain · ${saved.health.longScenes.length} scene(s) still long · ${saved.health.overlaps} overlap(s) · ${saved.health.unmapped} unmapped`,
      );
    }
    return { ...saved, validation };
  }

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
    applyRepairTimeline(timeline, "recalculate");
    setWarnings(warnings);
  }

  function saveSync() {
    if (!active) return;
    const health = summarizeTimeline(active);
    if (health.classified.blocking.length) {
      toast.error(`Cannot save: ${health.classified.blocking[0]}`);
      return;
    }
    const saved = persistAppliedTimeline(active, "save");
    if (saved.health.ready) toast.success("Sync saved");
    else toast.warning("Sync saved with timing warnings");
  }

  function repairSync() {
    if (!active) return;
    applyRepairTimeline(active, "repair");
  }

  function forceApplyRepair() {
    if (!active) return;
    applyRepairTimeline(active, "force");
  }

  useEffect(() => {
    if (!stored) return;
    const longScenes = classifyTimeline(stored).autoFixable.longScenes;
    if (!longScenes.length) return;
    const key = `${stored.projectId}:${longScenes.map((s) => `${s.sceneId}:${s.duration}`).join("|")}`;
    if (autoRepairKey.current === key) return;
    autoRepairKey.current = key;
    applyRepairTimeline(stored, "auto");
    setWarnings([]);
  }, [stored?.projectId, stored?.generatedAt]);

  function resetSync() {
    if (!selected) return;
    deleteSyncTimeline(selected.id);
    setPending(null);
    setAppliedTimeline(null);
    setRepairCheck(null);
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

  const timelineHealth = useMemo(() => active ? summarizeTimeline(active) : null, [active]);
  const validation = timelineHealth?.validation ?? null;
  const classified = timelineHealth?.classified ?? null;
  const ready = timelineHealth?.ready ?? false;
  const needsRepair = !!classified && (
    classified.autoFixable.longScenes.length > 0
    || classified.autoFixable.shortScenes.length > 0
    || classified.autoFixable.gaps.length > 0
    || (timelineHealth?.overlaps ?? 0) > 0
    || (timelineHealth?.unmapped ?? 0) > 0
  );
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
              <button
                onClick={repairSync}
                disabled={!active || !needsRepair}
                className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
                title="Split long scenes, merge/redistribute short ones, close gaps"
              >
                Repair Sync Issues
              </button>
              <button
                onClick={forceApplyRepair}
                disabled={!active}
                className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-40"
                title="Force-save the repaired 4-second capped timeline and reload it"
              >
                Force Apply 4s Repair
              </button>
              <button onClick={saveSync} disabled={!pending} className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40">Save Sync</button>
              <button onClick={exportJSON} disabled={!active} className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40">Export Timing JSON</button>
              <button onClick={resetSync} disabled={!stored} className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40">Reset Sync</button>
            </div>
          </div>

          {/* Ready banner */}
          {active && (
            <div
              className={[
                "mt-4 rounded-lg border p-3 text-xs",
                ready
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
                  : "border-destructive/40 bg-destructive/5 text-destructive",
              ].join(" ")}
            >
              <div className="font-semibold">
                {ready ? "READY — TIMING COMPLETE" : "NOT READY — TIMING ISSUES REMAIN"}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {ready
                  ? `0 gap(s) remain · 0 scene(s) still long`
                  : `${timelineHealth?.gaps ?? 0} gap(s) remain · ${timelineHealth?.longScenes.length ?? 0} scene(s) still long · ${timelineHealth?.overlaps ?? 0} overlap(s) · ${timelineHealth?.unmapped ?? 0} unmapped`}
              </div>
              {!ready && (timelineHealth?.longScenes.length ?? 0) > 0 && (
                <div className="mt-1 text-muted-foreground">
                  Long scenes: {formatLongScenes(timelineHealth!.longScenes.map((s) => ({ sceneId: s.sceneId, sceneNumber: s.sceneNumber, duration: s.duration })))}
                </div>
              )}
            </div>
          )}

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
              <Stat label="Gaps" value={`${timelineHealth?.gaps ?? 0}`} />
              <Stat label="Status" value={ready ? (pending ? "Preview" : "Complete") : "Warnings"} />
              <Stat label="Mode" value={active!.mode} />
            </div>
          )}

          {repairCheck && repairCheck.longScenes.length > 0 && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="font-medium">Long scenes remain after saved reload.</div>
              <div className="mt-1 text-muted-foreground">
                {formatLongScenes(repairCheck.longScenes)}
              </div>
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
          {(warnings.length > 0 || (classified && (classified.blocking.length || classified.warnings.length))) && (
            <div className="mt-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              {warnings.map((w, i) => <div key={`w${i}`} className="text-amber-700">• {w}</div>)}
              {classified?.blocking.map((e, i) => <div key={`e${i}`} className="text-destructive">✗ {e}</div>)}
              {classified?.warnings.map((w, i) => <div key={`vw${i}`} className="text-amber-700">! {w}</div>)}
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
  const img = useImage(scene.imageId || `scene:${topicId}:${scene.sceneNumber}`);
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
  const currentImg = useImage(currentScene ? (currentScene.imageId || `scene:${topicId}:${currentScene.sceneNumber}`) : null);

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