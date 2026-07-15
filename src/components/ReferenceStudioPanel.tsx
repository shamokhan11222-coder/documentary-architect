// Reference Studio panel — Whisk-style subject/style/environment references,
// true reference mode, and the 5-test approval gate.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  RefreshCw,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
} from "lucide-react";

import { fileToDataUrl, useImage } from "@/lib/images";
import {
  addReferenceCard,
  removeReferenceCard,
  replaceReferenceImage,
  updateReferenceCard,
  updateSubject,
  setImageMode,
  setAdapterId,
  resetTests,
  updateTest,
  useReferenceState,
  referenceImageId,
  activeCards,
  approvedTestCount,
  fullQueueUnlocked,
  collectActiveReferences,
  REF_CAPS,
  type RefCategory,
  type RefWeight,
  type ReferenceCard,
  type TestStatus,
} from "@/lib/image-studio/references";
import {
  compileReferencePrompt,
  isBannedInPrompt,
} from "@/lib/image-studio/reference-prompt";
import {
  listReferenceAdapters,
  getReferenceAdapter,
} from "@/lib/image-studio/reference-adapters";
import { putImage } from "@/lib/images";

const CATEGORIES: { id: RefCategory; label: string; hint: string }[] = [
  { id: "subject", label: "Subject", hint: "Main animal or character identity." },
  { id: "style", label: "Style", hint: "Line, color, texture, composition style." },
  { id: "environment", label: "Environment", hint: "Locations, weather, atmosphere." },
  { id: "composition", label: "Composition", hint: "Framing, subject placement, balance. (Optional)" },
];

export function ReferenceStudioPanel({ projectId }: { projectId: string | null }) {
  const state = useReferenceState(projectId);
  const adapters = listReferenceAdapters();
  const [adapterReady, setAdapterReady] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, boolean> = {};
      for (const a of adapters) map[a.id] = await a.isAvailable();
      if (!cancelled) setAdapterReady(map);
    })();
    return () => { cancelled = true; };
  }, [adapters]);

  const canUseReference = adapterReady[state.adapterId] ?? false;
  const unlocked = fullQueueUnlocked(state);
  const approved = approvedTestCount(state);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Reference Studio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload subject, style and environment references to guide every scene. Two independent
          modes: Free Text uses Pollinations/Puter with text and seeds only, Reference Mode sends
          your uploaded images to an image-capable provider.
        </p>
      </header>

      <ModeBar
        mode={state.mode}
        adapterId={state.adapterId}
        canUseReference={canUseReference}
        adapters={adapters.map((a) => ({ id: a.id, label: a.label, ready: adapterReady[a.id] ?? false }))}
        onMode={(m) => setImageMode(projectId, m)}
        onAdapter={(id) => setAdapterId(projectId, id)}
      />

      {state.mode === "free" && (
        <Callout tone="warn" icon={AlertTriangle}>
          Uploaded references cannot be sent to Pollinations or Puter. Free Mode uses text prompts
          and seeds only.
        </Callout>
      )}

      {state.mode === "reference" && !canUseReference && (
        <Callout tone="bad" icon={AlertTriangle}>
          The selected reference adapter is not available. Enable an image-capable provider or
          switch back to Free Text Mode.
        </Callout>
      )}

      <SubjectProfileEditor
        subject={state.subject}
        onChange={(patch) => updateSubject(projectId, patch)}
      />

      {CATEGORIES.map((cat) => (
        <CategorySection
          key={cat.id}
          projectId={projectId}
          category={cat.id}
          label={cat.label}
          hint={cat.hint}
          cards={state.cards.filter((c) => c.category === cat.id)}
        />
      ))}

      <TestsPanel
        projectId={projectId}
        state={state}
        approved={approved}
        unlocked={unlocked}
        canRun={state.mode === "reference" && canUseReference}
      />
    </div>
  );
}

// ---- mode bar ----
function ModeBar({
  mode,
  adapterId,
  canUseReference,
  adapters,
  onMode,
  onAdapter,
}: {
  mode: "free" | "reference";
  adapterId: string;
  canUseReference: boolean;
  adapters: { id: string; label: string; ready: boolean }[];
  onMode: (m: "free" | "reference") => void;
  onAdapter: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onMode("free")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "free"
              ? "border-brand/60 bg-brand/10 text-brand"
              : "border-border/60 bg-background hover:bg-accent/40"
          }`}
        >
          Free Text Mode
        </button>
        <button
          onClick={() => onMode("reference")}
          disabled={!canUseReference}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === "reference"
              ? "border-brand/60 bg-brand/10 text-brand"
              : "border-border/60 bg-background hover:bg-accent/40"
          }`}
          title={canUseReference ? "" : "No reference-capable provider is configured."}
        >
          Reference Mode
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Adapter</label>
        <select
          value={adapterId}
          onChange={(e) => onAdapter(e.target.value)}
          className="rounded-lg border border-border/60 bg-background px-2 py-1 text-sm"
        >
          {adapters.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} {a.ready ? "" : "(unavailable)"}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---- subject profile ----
function SubjectProfileEditor({
  subject,
  onChange,
}: {
  subject: import("@/lib/image-studio/references").SubjectProfile;
  onChange: (patch: Partial<import("@/lib/image-studio/references").SubjectProfile>) => void;
}) {
  const [traitsText, setTraitsText] = useState(subject.traits.join(", "));
  useEffect(() => setTraitsText(subject.traits.join(", ")), [subject.traits]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Lock className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold">Subject Profile</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Name" value={subject.name} onChange={(v) => onChange({ name: v })} placeholder="Baby Polar Bear Cub" />
        <TextField label="Species" value={subject.species} onChange={(v) => onChange({ species: v })} placeholder="Polar Bear" />
        <TextField label="Age" value={subject.age} onChange={(v) => onChange({ age: v })} placeholder="Cub" />
      </div>
      <div className="mt-3">
        <label className="text-xs font-medium text-muted-foreground">Traits (comma-separated)</label>
        <input
          value={traitsText}
          onChange={(e) => setTraitsText(e.target.value)}
          onBlur={() =>
            onChange({
              traits: traitsText.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder="white fluffy fur, small body, dark nose, dark eyes, rounded cub proportions"
          className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {(
          [
            ["lockSpecies", "Species"],
            ["lockAge", "Age"],
            ["lockFurColor", "Fur color"],
            ["lockFace", "Face identity"],
            ["lockBodyProportions", "Body proportions"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-1">
            <input
              type="checkbox"
              checked={subject[k] as boolean}
              onChange={(e) => onChange({ [k]: e.target.checked } as Partial<typeof subject>)}
            />
            Lock {label}
          </label>
        ))}
      </div>
    </section>
  );
}

function TextField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm"
      />
    </div>
  );
}

// ---- category section ----
function CategorySection({
  projectId, category, label, hint, cards,
}: {
  projectId: string | null;
  category: RefCategory;
  label: string;
  hint: string;
  cards: ReferenceCard[];
}) {
  const cap = REF_CAPS[category];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const full = cards.length >= cap;

  async function onUpload(file: File | null) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      const card = await addReferenceCard(projectId, category, file, url);
      if (!card) toast.error(`${label}: maximum ${cap} references.`);
      else toast.success(`${label} reference added.`);
    } catch {
      toast.error("Could not read that file.");
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{label} References</h3>
          <p className="text-xs text-muted-foreground">{hint} · {cards.length}/{cap}</p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={full}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
        />
      </div>
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          No references yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <ReferenceCardTile key={c.id} projectId={projectId} card={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReferenceCardTile({ projectId, card }: { projectId: string | null; card: ReferenceCard }) {
  const img = useImage(referenceImageId(card.id));
  const replaceRef = useRef<HTMLInputElement | null>(null);

  async function onReplace(file: File | null) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      await replaceReferenceImage(projectId, card.id, file, url);
      toast.success("Reference replaced.");
    } catch {
      toast.error("Could not read that file.");
    }
  }

  return (
    <div className={`rounded-xl border ${card.active ? "border-border/60" : "border-dashed border-border/40 opacity-70"} bg-background p-3`}>
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30">
        {img ? (
          <img src={img} alt={card.fileName} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">Loading…</span>
        )}
      </div>
      <div className="mt-2 truncate text-xs text-muted-foreground" title={card.fileName}>{card.fileName}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={card.active}
            onChange={(e) => updateReferenceCard(projectId, card.id, { active: e.target.checked })}
          />
          Active
        </label>
        <select
          value={card.weight}
          onChange={(e) => updateReferenceCard(projectId, card.id, { weight: e.target.value as RefWeight })}
          className="ml-auto rounded border border-border/60 bg-background px-1 py-0.5 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <textarea
        value={card.notes}
        onChange={(e) => updateReferenceCard(projectId, card.id, { notes: e.target.value })}
        placeholder="Notes (optional)"
        className="mt-2 w-full resize-none rounded border border-border/60 bg-background px-2 py-1 text-xs"
        rows={2}
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => replaceRef.current?.click()}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-xs hover:bg-accent/40"
        >
          <RefreshCw className="h-3 w-3" /> Replace
        </button>
        <button
          onClick={() => void removeReferenceCard(projectId, card.id)}
          className="inline-flex items-center justify-center gap-1 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
        <input
          ref={replaceRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onReplace(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

// ---- tests ----
function TestsPanel({
  projectId,
  state,
  approved,
  unlocked,
  canRun,
}: {
  projectId: string | null;
  state: import("@/lib/image-studio/references").ReferenceState;
  approved: number;
  unlocked: boolean;
  canRun: boolean;
}) {
  const [running, setRunning] = useState<string | null>(null);

  async function runTest(testId: string) {
    const test = state.tests.find((t) => t.id === testId);
    if (!test) return;
    if (!canRun) {
      toast.error("Reference Mode is off or the adapter is unavailable.");
      return;
    }
    const adapter = getReferenceAdapter(state.adapterId);
    if (!adapter) {
      toast.error("Adapter not found.");
      return;
    }
    setRunning(testId);
    updateTest(projectId, testId, { status: "running", error: undefined });
    try {
      const compiled = compileReferencePrompt(state, test.prompt);
      const banned = isBannedInPrompt(compiled.prompt.replace(/NEGATIVE:.*$/s, ""));
      if (banned) throw new Error(`Prompt contains banned subject "${banned}".`);
      const refs = await collectActiveReferences(state);
      if (!refs.subject.length) throw new Error("Add at least one Subject reference.");
      const out = await adapter.generateWithReferences({
        prompt: compiled.prompt,
        subjectReferences: refs.subject,
        styleReferences: refs.style,
        environmentReferences: refs.environment,
        compositionReferences: refs.composition,
        width: 1280,
        height: 720,
      });
      const imageId = `ref-test:${projectId ?? "none"}:${testId}`;
      await putImage(imageId, out.image);
      updateTest(projectId, testId, {
        status: "pending",
        imageId,
        provider: `${out.provider} · ${out.model}`,
        ranAt: Date.now(),
      });
      toast.success(`Test ${test.index} generated. Review and approve.`);
    } catch (e) {
      updateTest(projectId, testId, {
        status: "rejected",
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Reference Tests</h3>
          <p className="text-xs text-muted-foreground">
            Generate 5 tests. Approve at least 4 to unlock the full queue. Approved: {approved}/5.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              unlocked
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-amber-500/40 bg-amber-500/10 text-amber-500"
            }`}
          >
            {unlocked ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {unlocked ? "Full queue unlocked" : "Full queue locked"}
          </span>
          <button
            onClick={() => resetTests(projectId)}
            className="rounded-lg border border-border/60 bg-background px-2 py-1 text-xs hover:bg-accent/40"
          >
            Reset tests
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {state.tests.map((t) => (
          <TestCard
            key={t.id}
            test={t}
            running={running === t.id}
            canRun={canRun && !running}
            onRun={() => runTest(t.id)}
            onApprove={() => updateTest(projectId, t.id, { status: "approved" })}
            onReject={(status) => updateTest(projectId, t.id, { status })}
          />
        ))}
      </div>
    </section>
  );
}

function TestCard({
  test, running, canRun, onRun, onApprove, onReject,
}: {
  test: import("@/lib/image-studio/references").ReferenceTest;
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  onApprove: () => void;
  onReject: (status: TestStatus) => void;
}) {
  const img = useImage(test.imageId);
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3">
      <div className="flex items-center justify-between text-xs">
        <div className="font-semibold">#{test.index} · {test.label}</div>
        <StatusPill status={test.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{test.prompt}</p>
      <div className="mt-2 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30">
        {img ? (
          <img src={img} alt={test.label} className="h-full w-full object-cover" />
        ) : running ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating…
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Not generated</span>
        )}
      </div>
      {test.provider && <div className="mt-1 truncate text-[10px] text-muted-foreground">{test.provider}</div>}
      {test.error && <div className="mt-1 text-[10px] text-destructive">{test.error}</div>}
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          onClick={onRun}
          disabled={!canRun}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background px-2 py-1 text-xs font-medium hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3 w-3" /> {img ? "Regenerate" : "Generate"}
        </button>
        <button
          onClick={onApprove}
          disabled={!img}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-3 w-3" /> Approve
        </button>
        <select
          disabled={!img}
          value={test.status.startsWith("wrong") || test.status === "rejected" ? test.status : ""}
          onChange={(e) => onReject(e.target.value as TestStatus)}
          className="rounded border border-destructive/40 bg-background px-1 py-0.5 text-xs text-destructive"
        >
          <option value="">Reject as…</option>
          <option value="wrong-subject">Wrong subject</option>
          <option value="wrong-style">Wrong style</option>
          <option value="wrong-environment">Wrong environment</option>
          <option value="rejected">Other</option>
        </select>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TestStatus }) {
  const map: Record<TestStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pending: { label: "Pending", cls: "border-border/60 bg-muted/40 text-muted-foreground", Icon: Loader2 },
    running: { label: "Running", cls: "border-brand/40 bg-brand/10 text-brand", Icon: Loader2 },
    approved: { label: "Approved", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500", Icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "border-destructive/40 bg-destructive/10 text-destructive", Icon: XCircle },
    "wrong-subject": { label: "Wrong subject", cls: "border-destructive/40 bg-destructive/10 text-destructive", Icon: XCircle },
    "wrong-style": { label: "Wrong style", cls: "border-amber-500/40 bg-amber-500/10 text-amber-500", Icon: AlertTriangle },
    "wrong-environment": { label: "Wrong env.", cls: "border-amber-500/40 bg-amber-500/10 text-amber-500", Icon: AlertTriangle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

// ---- small ui ----
function Callout({
  tone, icon: Icon, children,
}: {
  tone: "warn" | "bad" | "info";
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const cls =
    tone === "bad"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
        : "border-brand/40 bg-brand/10 text-brand";
  return (
    <div className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

// activeCards re-export for consumers that read outside the panel.
export { activeCards };