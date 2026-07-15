import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Cpu,
  Download,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSelectedProject } from "@/components/ProjectPicker";
import { StageShell } from "@/components/StageShell";
import { useStory } from "@/lib/store";
import {
  DEFAULT_VOICE_SETTINGS,
  useVoice,
  saveVoice,
  scriptToParagraphs,
  estimateSeconds,
  fmtClock,
} from "@/lib/production";
import { useImage } from "@/lib/images";
import {
  generateVoiceBlock,
  voiceBlockId,
  getVoiceMeta,
} from "@/lib/generate-voice";
import type { VoiceBlock, VoiceSettings } from "@/lib/types";
import {
  DEFAULT_PRESET_ID,
  VOICE_PRESETS,
  getPreset,
} from "@/lib/local-tts/presets";
import {
  browserSupported,
  getEngineState,
  loadEngine,
  subscribeEngine,
  type EngineState,
} from "@/lib/local-tts/engine";
import {
  downloadBlob,
  exportFullNarration,
} from "@/lib/local-tts/export";
import { humanizeError } from "@/lib/humanize-error";

export const Route = createFileRoute("/voice")({
  head: () => ({
    meta: [
      { title: "Voice Studio — Local Free Narration" },
      {
        name: "description",
        content:
          "Generate narration locally in your browser with the free Kokoro voice engine. No API keys, no credits.",
      },
    ],
  }),
  component: VoicePage,
});

function VoicePage() {
  const { selected } = useSelectedProject();
  const story = useStory(selected?.id ?? null);
  const voice = useVoice(selected?.id ?? null);
  const settings: VoiceSettings = voice?.settings ?? DEFAULT_VOICE_SETTINGS;
  const presetId = settings.voicePresetId ?? DEFAULT_PRESET_ID;
  const speed = settings.speed || 1.0;
  const sentencePauseMs = settings.sentencePauseMs ?? 120;
  const paragraphPauseMs = settings.paragraphPauseMs ?? 500;
  const energy = settings.energy ?? 0.5;

  const [engine, setEngine] = useState<EngineState>(getEngineState());
  useEffect(() => subscribeEngine(setEngine), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [chunkStatus, setChunkStatus] = useState<string>("");
  const [testPassed, setTestPassed] = useState(false);
  const [queueState, setQueueState] = useState<{
    running: boolean;
    paused: boolean;
    stopRequested: boolean;
    current: number | null;
    completed: number;
    failed: number[];
    startedAt: number | null;
  }>({
    running: false,
    paused: false,
    stopRequested: false,
    current: null,
    completed: 0,
    failed: [],
    startedAt: null,
  });
  const queueRef = useRef(queueState);
  queueRef.current = queueState;

  const supported = browserSupported();

  function update(patch: Partial<VoiceSettings>) {
    if (!selected) return;
    const blocks = voice?.blocks ?? [];
    saveVoice({
      topicId: selected.id,
      settings: { ...settings, ...patch },
      blocks,
      generatedAt: Date.now(),
    });
  }

  async function ensureEngine(): Promise<boolean> {
    if (engine.status === "ready" || engine.status === "generating") return true;
    try {
      await loadEngine();
      return true;
    } catch (e) {
      toast.error(humanizeError(e, "Voice engine failed to load"));
      return false;
    }
  }

  function buildBlocks() {
    if (!selected || !story) return;
    const paras = scriptToParagraphs(story.script);
    const blocks: VoiceBlock[] = paras.map((text, i) => ({
      index: i,
      text,
      estSeconds: estimateSeconds(text),
    }));
    saveVoice({
      topicId: selected.id,
      settings,
      blocks,
      generatedAt: Date.now(),
    });
    toast.success(`${blocks.length} voice blocks created`);
  }

  // Energy tweaks speed slightly (low = -3%, natural = 0, lively = +5%).
  function energyAdjustedSpeed(): number {
    const bump = energy < 0.34 ? -0.03 : energy > 0.66 ? 0.05 : 0;
    return Math.max(0.85, Math.min(1.15, speed + bump));
  }

  async function genOne(block: VoiceBlock): Promise<number> {
    setChunkStatus("");
    return generateVoiceBlock(
      selected!.id,
      block.index,
      block.text,
      { ...settings, speed: energyAdjustedSpeed() },
      (i, total) => setChunkStatus(`Synthesizing chunk ${i + 1} of ${total}`),
    );
  }

  async function generateTest() {
    if (!selected || !voice || !voice.blocks.length) return;
    if (!(await ensureEngine())) return;
    const block = voice.blocks[0];
    setBusy("test");
    try {
      const real = await genOne(block);
      const blocks = voice.blocks.map((b) =>
        b.index === block.index ? { ...b, realSeconds: real, generatedAt: Date.now() } : b,
      );
      saveVoice({ ...voice, blocks });
      setTestPassed(true);
      toast.success(`Test block ready — ${real.toFixed(1)}s`);
    } catch (e) {
      toast.error(humanizeError(e, "Voice generation failed"));
    } finally {
      setBusy(null);
      setChunkStatus("");
    }
  }

  async function genBlock(block: VoiceBlock) {
    if (!selected || !voice) return;
    if (!(await ensureEngine())) return;
    setBusy(`b-${block.index}`);
    try {
      const real = await genOne(block);
      const blocks = voice.blocks.map((b) =>
        b.index === block.index ? { ...b, realSeconds: real, generatedAt: Date.now() } : b,
      );
      saveVoice({ ...voice, blocks });
      toast.success(`Block ${block.index + 1} narrated`);
    } catch (e) {
      toast.error(humanizeError(e, "Voice generation failed"));
    } finally {
      setBusy(null);
      setChunkStatus("");
    }
  }

  async function generateAll() {
    if (!selected || !voice) return;
    if (!testPassed && !voice.blocks.some((b) => b.realSeconds != null)) {
      toast.error("Run the Test Block first.");
      return;
    }
    if (!(await ensureEngine())) return;
    setQueueState({
      running: true,
      paused: false,
      stopRequested: false,
      current: null,
      completed: 0,
      failed: [],
      startedAt: Date.now(),
    });
    let blocks = [...voice.blocks];
    const failed: number[] = [];
    for (const block of voice.blocks) {
      // wait while paused
      while (queueRef.current.paused && !queueRef.current.stopRequested) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (queueRef.current.stopRequested) break;
      if (block.realSeconds != null) {
        setQueueState((s) => ({ ...s, completed: s.completed + 1 }));
        continue;
      }
      setQueueState((s) => ({ ...s, current: block.index }));
      try {
        const real = await genOne(block);
        blocks = blocks.map((b) =>
          b.index === block.index ? { ...b, realSeconds: real, generatedAt: Date.now() } : b,
        );
        // Persist immediately so a refresh preserves progress.
        saveVoice({ ...voice, blocks, generatedAt: Date.now() });
        setQueueState((s) => ({ ...s, completed: s.completed + 1 }));
      } catch (e) {
        failed.push(block.index);
        setQueueState((s) => ({ ...s, failed: [...s.failed, block.index] }));
        toast.error(
          `Block ${block.index + 1}: ${humanizeError(e, "voice generation failed")}. Completed blocks are safe.`,
        );
      }
    }
    setQueueState((s) => ({
      ...s,
      running: false,
      paused: false,
      stopRequested: false,
      current: null,
    }));
    setChunkStatus("");
    if (!failed.length && !queueRef.current.stopRequested) {
      toast.success("Narration complete");
    }
  }

  function editText(index: number, text: string) {
    if (!voice) return;
    saveVoice({
      ...voice,
      blocks: voice.blocks.map((b) =>
        b.index === index
          ? { ...b, text, estSeconds: estimateSeconds(text), realSeconds: undefined }
          : b,
      ),
    });
  }

  async function exportNarration() {
    if (!selected || !voice) return;
    setBusy("export");
    try {
      const result = await exportFullNarration(
        selected.id,
        voice.blocks,
        paragraphPauseMs,
      );
      if (!result) {
        toast.error("No completed voice blocks to export.");
        return;
      }
      const base = (selected.title || selected.id).replace(/[^\w-]+/g, "_");
      downloadBlob(result.wav, `${base}_narration.wav`);
      const timingBlob = new Blob([JSON.stringify(result.timing, null, 2)], {
        type: "application/json",
      });
      downloadBlob(timingBlob, `${base}_narration_timing.json`);
      toast.success("Narration exported");
    } catch (e) {
      toast.error(humanizeError(e, "Export failed"));
    } finally {
      setBusy(null);
    }
  }

  const generatedCount = (voice?.blocks ?? []).filter((b) => b.realSeconds != null).length;
  const totalReal = (voice?.blocks ?? []).reduce(
    (s, b) => s + (b.realSeconds ?? b.estSeconds),
    0,
  );

  return (
    <StageShell stage="voice" maxWidth="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Voice Studio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        100% free local narration — powered by Kokoro 82M running in your browser. No API keys, no
        credits, no server calls.
      </p>

      {!supported && (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Your browser does not support the local voice engine. Use a recent version of Chrome or
          Edge.
        </p>
      )}

      <EngineCard engine={engine} onLoad={() => void loadEngine().catch(() => {})} />

      {!selected && <p className="mt-6 text-sm text-muted-foreground">Select a project to begin.</p>}
      {selected && !story && (
        <p className="mt-4 text-xs text-amber-600">No script found. Run the Story Engine first.</p>
      )}

      {selected && story && (
        <>
          <div className="mt-6 rounded-xl border border-border p-4">
            <div className="text-sm font-medium">Voice preset</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {VOICE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => update({ voicePresetId: p.id })}
                  className={[
                    "rounded-lg border p-3 text-left transition-colors",
                    presetId === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground">{p.desc}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {p.gender} · {p.voice}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Ctrl
                label="Speed"
                value={speed}
                min={0.85}
                max={1.15}
                step={0.01}
                onChange={(v) => update({ speed: v })}
              />
              <Ctrl
                label="Sentence pause (ms)"
                value={sentencePauseMs}
                min={0}
                max={600}
                step={20}
                onChange={(v) => update({ sentencePauseMs: Math.round(v) })}
                format={(v) => `${Math.round(v)}`}
              />
              <Ctrl
                label="Paragraph pause (ms)"
                value={paragraphPauseMs}
                min={0}
                max={1500}
                step={50}
                onChange={(v) => update({ paragraphPauseMs: Math.round(v) })}
                format={(v) => `${Math.round(v)}`}
              />
              <div>
                <div className="mb-2 text-xs font-medium">Energy</div>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={energy < 0.34 ? "low" : energy > 0.66 ? "lively" : "natural"}
                  onChange={(e) =>
                    update({
                      energy:
                        e.target.value === "low"
                          ? 0.2
                          : e.target.value === "lively"
                            ? 0.8
                            : 0.5,
                    })
                  }
                >
                  <option value="low">Low</option>
                  <option value="natural">Natural</option>
                  <option value="lively">Lively</option>
                </select>
              </div>
            </div>

            <Dictionary settings={settings} onChange={(dictionary) => update({ dictionary })} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={buildBlocks} variant="outline">
              <Mic className="mr-2 h-4 w-4" />
              {voice?.blocks.length ? "Rebuild Blocks" : "Build Voice Blocks"}
            </Button>
            {voice?.blocks.length ? (
              <>
                <Button
                  onClick={generateTest}
                  disabled={!!busy || queueState.running || !supported}
                >
                  {busy === "test" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Generate Test Block
                </Button>
                <Button
                  variant="secondary"
                  onClick={generateAll}
                  disabled={
                    !!busy ||
                    queueState.running ||
                    !supported ||
                    (!testPassed && generatedCount === 0)
                  }
                  title={
                    !testPassed && generatedCount === 0
                      ? "Run the Test Block first"
                      : undefined
                  }
                >
                  Generate All Voice Blocks
                </Button>
                {queueState.running && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQueueState((s) => ({ ...s, paused: !s.paused }))
                      }
                    >
                      {queueState.paused ? (
                        <Play className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Pause className="mr-1 h-3.5 w-3.5" />
                      )}
                      {queueState.paused ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQueueState((s) => ({ ...s, stopRequested: true, paused: false }))
                      }
                    >
                      <Square className="mr-1 h-3.5 w-3.5" /> Stop
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={exportNarration}
                  disabled={!!busy || queueState.running || generatedCount === 0}
                >
                  {busy === "export" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export Full Narration
                </Button>
              </>
            ) : null}
          </div>

          {(queueState.running || chunkStatus) && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              {queueState.running && (
                <div>
                  Block {queueState.current != null ? queueState.current + 1 : "—"} ·{" "}
                  {queueState.completed}/{voice?.blocks.length} completed ·{" "}
                  {queueState.failed.length} failed
                  {queueState.startedAt
                    ? ` · ${fmtClock(Math.round((Date.now() - queueState.startedAt) / 1000))} elapsed`
                    : ""}
                </div>
              )}
              {chunkStatus && <div className="text-muted-foreground">{chunkStatus}</div>}
            </div>
          )}

          {voice?.blocks.length ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryStat label="Total duration" value={fmtClock(totalReal)} />
              <SummaryStat label="Paragraphs" value={String(voice.blocks.length)} />
              <SummaryStat label="Narrated" value={`${generatedCount}/${voice.blocks.length}`} />
              <SummaryStat label="Preset" value={getPreset(presetId).label} />
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {(voice?.blocks ?? []).map((b) => (
              <VoiceBlockCard
                key={b.index}
                topicId={selected.id}
                block={b}
                busy={busy === `b-${b.index}`}
                current={queueState.current === b.index}
                failed={queueState.failed.includes(b.index)}
                onGen={() => genBlock(b)}
                onEdit={(t) => editText(b.index, t)}
              />
            ))}
          </div>
        </>
      )}
    </StageShell>
  );
}

function EngineCard({ engine, onLoad }: { engine: EngineState; onLoad: () => void }) {
  const label: Record<EngineState["status"], string> = {
    idle: "Not loaded",
    downloading: "Downloading model",
    initializing: "Initializing",
    ready: engine.fromCache ? "Loaded from local cache" : "Ready",
    generating: "Generating",
    error: "Error",
  };
  const pct = Math.round(engine.progress * 100);
  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4" /> Local Kokoro Voice — Free
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Status: {label[engine.status]}
            {engine.device ? ` · ${engine.device.toUpperCase()}` : ""}
            {engine.currentFile ? ` · ${engine.currentFile}` : ""}
          </div>
        </div>
        <Button
          size="sm"
          onClick={onLoad}
          disabled={engine.status === "downloading" || engine.status === "initializing" || engine.status === "ready" || engine.status === "generating"}
        >
          {engine.status === "downloading" || engine.status === "initializing" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileAudio className="mr-2 h-4 w-4" />
          )}
          {engine.status === "ready" || engine.status === "generating"
            ? "Engine Ready"
            : "Load Free Voice Engine"}
        </Button>
      </div>
      {(engine.status === "downloading" || engine.status === "initializing") && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{pct}%</div>
        </div>
      )}
      {engine.status === "error" && engine.error && (
        <p className="mt-2 text-xs text-red-600">{engine.error}</p>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Ctrl({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function Dictionary({
  settings,
  onChange,
}: {
  settings: VoiceSettings;
  onChange: (d: VoiceSettings["dictionary"]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="text-sm font-medium">Pronunciation Dictionary</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="Word"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="Say it as…"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (!from.trim() || !to.trim()) return;
            onChange([...settings.dictionary, { from: from.trim(), to: to.trim() }]);
            setFrom("");
            setTo("");
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {settings.dictionary.map((d, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {d.from} → {d.to}
            <button onClick={() => onChange(settings.dictionary.filter((_, x) => x !== i))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function VoiceBlockCard({
  topicId,
  block,
  busy,
  current,
  failed,
  onGen,
  onEdit,
}: {
  topicId: string;
  block: VoiceBlock;
  busy: boolean;
  current: boolean;
  failed: boolean;
  onGen: () => void;
  onEdit: (t: string) => void;
}) {
  const audio = useImage(voiceBlockId(topicId, block.index));
  const meta = getVoiceMeta(voiceBlockId(topicId, block.index));
  return (
    <div
      className={[
        "rounded-xl border p-3",
        current ? "border-primary" : failed ? "border-red-500/40" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Block {block.index + 1}</span>
        <span className="text-xs text-muted-foreground">
          ~{fmtClock(block.estSeconds)}
          {block.realSeconds ? ` · actual ${fmtClock(block.realSeconds)}` : ""}
          {meta ? ` · ${meta.voicePresetId}` : ""}
        </span>
      </div>
      <textarea
        className="mt-2 w-full resize-y rounded-md border border-input bg-background p-2 text-sm"
        rows={2}
        value={block.text}
        onChange={(e) => onEdit(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onGen} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          {audio ? "Regenerate" : "Generate"}
        </Button>
        {audio && (
          <>
            <audio controls src={audio} className="h-8" />
            <a
              href={audio}
              download={`block-${block.index + 1}.wav`}
              className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
            >
              <Download className="h-3 w-3" /> WAV
            </a>
          </>
        )}
      </div>
    </div>
  );
}