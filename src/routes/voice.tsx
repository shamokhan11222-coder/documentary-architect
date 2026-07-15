import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, Plus, X, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSelectedProject } from "@/components/ProjectPicker";
import { StageShell } from "@/components/StageShell";
import { useStory } from "@/lib/store";
import {
  DEFAULT_VOICE_SETTINGS,
  useVoice,
  saveVoice,
  useVoiceProfiles,
  getVoiceProfile,
  scriptToParagraphs,
  estimateSeconds,
  fmtClock,
} from "@/lib/production";
import { useImage } from "@/lib/images";
import {
  generateVoiceBlock,
  voiceBlockId,
  VOICE_GENERATION_ENABLED,
  VOICE_DISABLED_MESSAGE,
} from "@/lib/generate-voice";
import type { NarratorProfile, VoiceBlock, VoiceSettings } from "@/lib/types";
import { pitchSimilarity, measurePitchHz } from "@/lib/voice-analysis";
import { CustomVoice } from "@/components/CustomVoice";
import { humanizeError } from "@/lib/humanize-error";
import { hasUnlimitedAccess } from "@/lib/account";

export const Route = createFileRoute("/voice")({
  head: () => ({ meta: [{ title: "Voice Studio — Stickmax Studio" }] }),
  component: VoicePage,
});

const PROFILES: { key: NarratorProfile; label: string; desc: string }[] = [
  { key: "deep", label: "Deep Documentary", desc: "Authoritative, resonant" },
  { key: "calm", label: "Calm Narrator", desc: "Warm, measured" },
  { key: "storyteller", label: "Story Teller", desc: "Expressive, engaging" },
  { key: "educational", label: "Educational", desc: "Clear, explanatory" },
  { key: "cinematic", label: "Cinematic", desc: "Dramatic, trailer-like" },
];

function VoicePage() {
  const { selected } = useSelectedProject();
  const story = useStory(selected?.id ?? null);
  const voice = useVoice(selected?.id ?? null);
  const settings = voice?.settings ?? DEFAULT_VOICE_SETTINGS;
  const profiles = useVoiceProfiles();
  const [busy, setBusy] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Measured clone similarity from the most recent preview (0-1), and whether
  // it passed the required threshold. Full generation is blocked until a
  // preview passes.
  const [similarity, setSimilarity] = useState<number | null>(null);

  // The cloned voice selected for this project (persisted per project via
  // settings.clonedProfileId). When profiles exist, one must be selected
  // before any voiceover can be generated.
  const selectedProfile = profiles.find((p) => p.id === settings.clonedProfileId) ?? null;

  /** Settings actually used for generation — a selected cloned profile's saved
   *  settings take over, but the project's pronunciation dictionary is kept. */
  function genSettings(): VoiceSettings {
    if (selectedProfile?.settings) {
      return { ...selectedProfile.settings, dictionary: settings.dictionary, clonedProfileId: selectedProfile.id };
    }
    return settings;
  }

  /** Returns an error message if voiceover generation is not allowed yet. */
  function voiceGuard(): string | null {
    if (profiles.length > 0 && !settings.clonedProfileId) return "Select a voice profile first.";
    if (settings.clonedProfileId) {
      const p = getVoiceProfile(settings.clonedProfileId);
      if (!p) return "Select a voice profile first.";
      if (!p.sampleAudioId && !p.sampleAudio)
        return "Voice sample missing. Upload or record a sample for this profile.";
      if (!p.consent) return "Permission not confirmed for this voice profile.";
      // Similarity gate: require a passing preview before generating anything.
      const target = genSettings().similarityTarget ?? 0.9;
      if (similarity == null)
        return "Run Preview Clone first to check voice similarity.";
      if (similarity < target) return "Voice clone quality is insufficient.";
    }
    return null;
  }

  function update(patch: Partial<VoiceSettings>) {
    if (!selected) return;
    const blocks = voice?.blocks ?? [];
    saveVoice({ topicId: selected.id, settings: { ...settings, ...patch }, blocks, generatedAt: Date.now() });
    // Any change that affects the cloned voice invalidates the last similarity
    // check — force a fresh preview before generation is unlocked again.
    if (
      ["clonedProfileId", "pitch", "age", "energy", "style", "profile", "speed", "stability"].some(
        (k) => k in patch,
      )
    ) {
      setSimilarity(null);
      setPreviewUrl(null);
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
    saveVoice({ topicId: selected.id, settings, blocks, generatedAt: Date.now() });
    toast.success(`${blocks.length} voice blocks created`);
  }

  async function genBlock(block: VoiceBlock) {
    if (!selected || !voice) return;
    const guard = voiceGuard();
    if (guard) {
      toast.error(guard);
      return;
    }
    setBusy(`b-${block.index}`);
    try {
      const real = await generateVoiceBlock(selected.id, block.index, block.text, genSettings());
      const blocks = voice.blocks.map((b) =>
        b.index === block.index ? { ...b, realSeconds: real, generatedAt: Date.now() } : b,
      );
      saveVoice({ ...voice, blocks });
      toast.success(`Block ${block.index + 1} narrated`);
    } catch (e) {
      toast.error(humanizeError(e, "Voice generation failed"));
    } finally {
      setBusy(null);
    }
  }

  async function genAll() {
    if (!selected || !voice) return;
    const guard = voiceGuard();
    if (guard) {
      toast.error(guard);
      return;
    }
    setBusy("all");
    let blocks = [...voice.blocks];
    let creditsOut = false;
    // Smart cache: only narrate blocks that haven't been generated yet.
    const pending = voice.blocks.filter((b) => b.realSeconds == null);
    if (!pending.length) {
      setBusy(null);
      toast.info("Every paragraph is already narrated.");
      return;
    }
    for (const block of pending) {
      try {
        const real = await generateVoiceBlock(selected.id, block.index, block.text, genSettings());
        blocks = blocks.map((b) => (b.index === block.index ? { ...b, realSeconds: real, generatedAt: Date.now() } : b));
        saveVoice({ ...voice, blocks, generatedAt: Date.now() });
      } catch (e) {
        const msg = humanizeError(e, "voice generation failed");
        if (!hasUnlimitedAccess() && /credit|CREDITS_EXHAUSTED|402/i.test(msg)) {
          creditsOut = true;
          toast.error("Credits exhausted. Your generated voice blocks are saved. Continue later.");
        } else {
          toast.error(`Block ${block.index + 1}: ${msg}`);
        }
        break;
      }
    }
    setBusy(null);
    if (!creditsOut) toast.success("Narration complete");
  }

  /** Preview Clone — narrate a single sentence so the user can compare the
   *  generated voice against the uploaded sample. */
  async function previewClone() {
    if (!selectedProfile) {
      toast.error("Select a voice profile first.");
      return;
    }
    // Preview must run even when the similarity gate hasn't passed yet — it's
    // how the gate gets measured. Only check the basic sample/consent guards.
    const p = getVoiceProfile(selectedProfile.id);
    if (!p || (!p.sampleAudioId && !p.sampleAudio)) {
      toast.error("Voice sample missing for this profile.");
      return;
    }
    if (!p.consent) {
      toast.error("Permission not confirmed for this voice profile.");
      return;
    }
    setBusy("preview");
    setPreviewUrl(null);
    setSimilarity(null);
    const sentence = "This is a preview of the selected voice clone. Compare it with your uploaded sample.";
    const key = `voicepreview:${selectedProfile.id}`;
    try {
      await generateVoiceBlock("__preview__", -1, sentence, {
        ...genSettings(),
        // reuse the preview slot instead of a real block index
      });
      // generateVoiceBlock stores under voice:__preview__:-1
      const { loadImage } = await import("@/lib/images");
      const url = await loadImage(voiceBlockId("__preview__", -1));
      setPreviewUrl(url ?? null);
      void key;
      // Measure similarity against the uploaded sample's pitch fingerprint.
      const target = genSettings().similarityTarget ?? 0.9;
      if (url && selectedProfile.pitchHz) {
        try {
          const genHz = await measurePitchHz(url);
          const sim = pitchSimilarity(selectedProfile.pitchHz, genHz);
          setSimilarity(sim);
          if (sim < target) {
            toast.error("Voice clone quality is insufficient.");
          } else {
            toast.success(`Clone preview ready — ${Math.round(sim * 100)}% similarity`);
          }
        } catch {
          setSimilarity(null);
          toast.warning("Preview ready, but similarity could not be measured.");
        }
      } else {
        // No sample fingerprint — cannot verify quality; allow but warn.
        setSimilarity(target);
        toast.success("Clone preview ready");
      }
    } catch (e) {
      toast.error(humanizeError(e, "Preview failed"));
    } finally {
      setBusy(null);
    }
  }

  function editText(index: number, text: string) {
    if (!voice) return;
    saveVoice({
      ...voice,
      blocks: voice.blocks.map((b) => (b.index === index ? { ...b, text, estSeconds: estimateSeconds(text) } : b)),
    });
  }

  const totalEst = (voice?.blocks ?? []).reduce((s, b) => s + (b.realSeconds ?? b.estSeconds), 0);
  const generatedCount = (voice?.blocks ?? []).filter((b) => b.realSeconds != null).length;

  return (
    <StageShell stage="voice" maxWidth="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Voice Studio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate natural documentary narration. Each paragraph is its own voice block you can preview and regenerate.
      </p>

      {!selected && <p className="mt-6 text-sm text-muted-foreground">Select a project to begin.</p>}
      {selected && !story && (
        <p className="mt-4 text-xs text-amber-600">No script found. Run the Story Engine first.</p>
      )}

      {selected && story && (
        <>
          <div className="mt-6 rounded-xl border border-border p-4">
            <div className="text-sm font-medium">Narrator profile</div>
            <div className="mt-3">
              <label className="text-xs font-medium">Voice name</label>
              <input
                className="mt-1 h-8 w-56 rounded-md border border-input bg-background px-2 text-sm"
                placeholder="Voice name"
                value={settings.voiceName ?? ""}
                onChange={(e) => update({ voiceName: e.target.value })}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PROFILES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => update({ profile: p.key })}
                  className={[
                    "rounded-lg border p-3 text-left transition-colors",
                    settings.profile === p.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground">{p.desc}</div>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Ctrl label="Speed" value={settings.speed} min={0.7} max={1.2} step={0.05} onChange={(v) => update({ speed: v })} />
              <Ctrl label="Stability" value={settings.stability} onChange={(v) => update({ stability: v })} />
              <Ctrl label="Emotion" value={settings.emotion} onChange={(v) => update({ emotion: v })} />
              <Ctrl label="Pause Length" value={settings.pauseStrength} onChange={(v) => update({ pauseStrength: v })} />
              <Ctrl label="Pitch" value={settings.pitch} onChange={(v) => update({ pitch: v })} />
              <Ctrl label="Age (young → older)" value={settings.age ?? 0.3} onChange={(v) => update({ age: v })} />
              <Ctrl label="Energy" value={settings.energy ?? 0.5} onChange={(v) => update({ energy: v })} />
              <Ctrl
                label="Min Similarity %"
                value={settings.similarityTarget ?? 0.9}
                min={0.5}
                max={0.99}
                step={0.01}
                onChange={(v) => update({ similarityTarget: v })}
              />
              <div>
                <div className="mb-2 text-xs font-medium">Style</div>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={settings.style ?? "documentary"}
                  onChange={(e) => update({ style: e.target.value as VoiceSettings["style"] })}
                >
                  <option value="documentary">Documentary</option>
                  <option value="friendly">Friendly</option>
                  <option value="narrative">Storyteller</option>
                  <option value="educational">Educational</option>
                  <option value="energetic">Energetic</option>
                </select>
              </div>
            </div>

            <Dictionary settings={settings} onChange={(dictionary) => update({ dictionary })} />

            <CustomVoice
              activeProfileId={settings.clonedProfileId}
              onUse={(id) => update({ clonedProfileId: id })}
              currentSettings={settings}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {/* Select Voice Profile — drives which cloned voice narration uses. */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Voice profile</label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={settings.clonedProfileId ?? ""}
                onChange={(e) => update({ clonedProfileId: e.target.value || undefined })}
              >
                <option value="">Select a voice profile…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={buildBlocks}>
              <Mic className="mr-2 h-4 w-4" /> {voice?.blocks.length ? "Rebuild Blocks" : "Build Voice Blocks"}
            </Button>
            {selectedProfile && (
              <Button
                variant="outline"
                onClick={previewClone}
                disabled={!!busy || !VOICE_GENERATION_ENABLED}
                title={!VOICE_GENERATION_ENABLED ? VOICE_DISABLED_MESSAGE : undefined}
              >
                {busy === "preview" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Preview Clone
              </Button>
            )}
            {voice?.blocks.length ? (
              <Button
                variant="secondary"
                onClick={genAll}
                disabled={!!busy || !VOICE_GENERATION_ENABLED}
                title={!VOICE_GENERATION_ENABLED ? VOICE_DISABLED_MESSAGE : undefined}
              >
                {busy === "all" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Remaining
              </Button>
            ) : null}
          </div>

          {!VOICE_GENERATION_ENABLED && (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {VOICE_DISABLED_MESSAGE} Existing narrated blocks below remain playable.
            </p>
          )}

          {profiles.length > 0 && !settings.clonedProfileId && (
            <p className="mt-2 text-xs text-amber-600">Select a voice profile first.</p>
          )}

          {selectedProfile && (
            <div className="mt-3 rounded-lg border border-border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">Active Voice Profile:</span>
                <span>{selectedProfile.name}</span>
                <span className="text-muted-foreground">Voice ID: {selectedProfile.id.slice(0, 8)}</span>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 font-medium",
                    selectedProfile.status && selectedProfile.status !== "ready"
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-green-500/15 text-green-600 dark:text-green-400",
                  ].join(" ")}
                >
                  {selectedProfile.status && selectedProfile.status !== "ready"
                    ? "Processing"
                    : "Ready"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
                <ValRow label="Gender" ok={selectedProfile.gender !== "unknown"} value={selectedProfile.gender ?? "unknown"} />
                <ValRow
                  label="Pitch"
                  ok={!!selectedProfile.pitchHz}
                  value={selectedProfile.pitchHz ? `${selectedProfile.pitchHz} Hz` : "—"}
                />
                <ValRow
                  label="Sample length"
                  ok={(selectedProfile.sampleSeconds ?? 0) >= 30}
                  value={selectedProfile.sampleSeconds ? `${Math.round(selectedProfile.sampleSeconds)}s` : "—"}
                />
                <ValRow
                  label="Confidence"
                  ok={(selectedProfile.analysisConfidence ?? 0) >= 0.5}
                  value={
                    selectedProfile.analysisConfidence != null
                      ? `${Math.round(selectedProfile.analysisConfidence * 100)}%`
                      : "—"
                  }
                />
              </div>
              {(selectedProfile.sampleSeconds ?? 60) < 30 && (
                <p className="mt-2 text-amber-600">
                  For higher accuracy, use 30–60s of clean speech with no music or background noise.
                </p>
              )}
              {similarity != null && (
                <div className="mt-2">
                  {similarity < (genSettings().similarityTarget ?? 0.9) ? (
                    <p className="font-medium text-red-600">
                      Voice clone quality is insufficient. ({Math.round(similarity * 100)}% vs{" "}
                      {Math.round((genSettings().similarityTarget ?? 0.9) * 100)}% required)
                    </p>
                  ) : (
                    <p className="font-medium text-green-600 dark:text-green-400">
                      Clone similarity: {Math.round(similarity * 100)}% — ready to generate.
                    </p>
                  )}
                </div>
              )}
              {previewUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-muted-foreground">Clone preview:</span>
                  <audio controls src={previewUrl} className="h-8" />
                </div>
              )}
            </div>
          )}

          {voice?.blocks.length ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryStat label="Total duration" value={fmtClock(totalEst)} />
              <SummaryStat label="Estimated video length" value={fmtClock(totalEst)} />
              <SummaryStat label="Paragraphs" value={String(voice.blocks.length)} />
              <SummaryStat label="Narrated" value={`${generatedCount}/${voice.blocks.length}`} />
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {(voice?.blocks ?? []).map((b) => (
              <VoiceBlockCard
                key={b.index}
                topicId={selected.id}
                block={b}
                busy={busy === `b-${b.index}`}
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
function ValRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "text-green-600 dark:text-green-400" : "text-amber-600"}>{value}</span>
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value.toFixed(2)}</span>
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
  onGen,
  onEdit,
}: {
  topicId: string;
  block: VoiceBlock;
  busy: boolean;
  onGen: () => void;
  onEdit: (t: string) => void;
}) {
  const audio = useImage(voiceBlockId(topicId, block.index));
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Block {block.index + 1}</span>
        <span className="text-xs text-muted-foreground">
          ~{fmtClock(block.estSeconds)}
          {block.realSeconds ? ` · actual ${fmtClock(block.realSeconds)}` : ""}
        </span>
      </div>
      <textarea
        className="mt-2 w-full resize-y rounded-md border border-input bg-background p-2 text-sm"
        rows={2}
        value={block.text}
        onChange={(e) => onEdit(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={onGen}
          disabled={busy || !VOICE_GENERATION_ENABLED}
          title={!VOICE_GENERATION_ENABLED ? VOICE_DISABLED_MESSAGE : undefined}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          {audio ? "Regenerate" : "Generate"}
        </Button>
        {audio && (
          <>
            <audio controls src={audio} className="h-8" />
            <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
              <Play className="h-3 w-3" /> Ready
            </span>
          </>
        )}
      </div>
    </div>
  );
}
