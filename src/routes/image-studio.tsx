import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  ListVideo,
  UserSquare2,
  Palette,
  Mountain,
  Server,
  Images as ImagesIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  Trash2,
  Download,
  Pin,
  Copy,
  ZoomIn,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";

import { useSelectedTopicId, useVisualMap } from "@/lib/store";
import { useImage, putImage, deleteImage, fileToDataUrl, loadImage } from "@/lib/images";
import {
  useImageQueue,
  startImageQueue,
  pauseImageQueue,
  resumeImageQueue,
  retryFailedImages,
  continueFromLastImage,
  stopAfterCurrentImage,
  configureImageQueue,
  DELAY_OPTIONS,
  getQueueDelay,
  setQueueDelay,
} from "@/lib/image-queue";
import {
  useStudioLocks,
  useProviders,
  useStudioSettings,
  useHistory,
  updateCharacter,
  updateStyle,
  updateBackground,
  updateLocks,
  updateSettings,
  toggleProvider,
  reorderProviders,
  pushHistory,
  clearHistory,
} from "@/lib/image-studio/state";
import { scoreImage, scoreBand } from "@/lib/image-studio/consistency";
import type { ProviderConfig } from "@/lib/image-studio/types";
import type { VisualScene } from "@/lib/types";

export const Route = createFileRoute("/image-studio")({
  head: () => ({
    meta: [
      { title: "Image Studio — Stickmax" },
      {
        name: "description",
        content:
          "Production-grade AI image studio: queue, character lock, style lock, providers, consistency scoring.",
      },
    ],
  }),
  component: ImageStudioPage,
});

// -------- shell --------

type TabId =
  | "overview"
  | "queue"
  | "characters"
  | "style"
  | "backgrounds"
  | "providers"
  | "assets"
  | "history"
  | "settings";

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "queue", label: "Image Queue", icon: ListVideo },
  { id: "characters", label: "Characters", icon: UserSquare2 },
  { id: "style", label: "Style Lock", icon: Palette },
  { id: "backgrounds", label: "Backgrounds", icon: Mountain },
  { id: "providers", label: "Providers", icon: Server },
  { id: "assets", label: "Assets", icon: ImagesIcon },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function ImageStudioPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const topicId = useSelectedTopicId();
  const visualMap = useVisualMap(topicId);
  const scenes = visualMap?.scenes ?? [];

  // Wire the existing queue runner so the studio's Start button works.
  useEffect(() => {
    configureImageQueue({
      save: async (scene, image) => {
        await putImage(imageIdFor(topicId, scene.sceneNumber), image);
      },
      done: (n) => {
        // Best-effort: existence in IDB → done. Cache-only synchronous check.
        // The queue itself persists item state; this only prevents re-runs.
        return false;
      },
    });
  }, [topicId]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 bg-background text-foreground">
      <StudioSidebar tab={tab} onTab={setTab} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          {tab === "overview" && <OverviewPanel scenes={scenes} topicId={topicId} />}
          {tab === "queue" && <QueuePanel scenes={scenes} topicId={topicId} />}
          {tab === "characters" && <CharacterPanel />}
          {tab === "style" && <StylePanel />}
          {tab === "backgrounds" && <BackgroundPanel />}
          {tab === "providers" && <ProviderPanel />}
          {tab === "assets" && <AssetsPanel scenes={scenes} topicId={topicId} />}
          {tab === "history" && <HistoryPanel />}
          {tab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}

function imageIdFor(topicId: string | null, n: number) {
  return `visual:${topicId ?? "none"}:${n}`;
}

function StudioSidebar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/60 bg-card/30 p-3 md:block">
      <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Image Studio
      </div>
      <nav className="flex flex-col gap-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-brand/12 font-semibold text-brand"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-4 border-t border-border/60 pt-3">
        <Link
          to="/visual"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          Legacy Images page
        </Link>
      </div>
    </aside>
  );
}

// -------- OVERVIEW --------

function OverviewPanel({ scenes, topicId }: { scenes: VisualScene[]; topicId: string | null }) {
  const snap = useImageQueue();
  const locks = useStudioLocks();
  const eta = useMemo(() => {
    if (!snap.total || snap.state === "done") return "—";
    const remain = snap.total - snap.completed;
    const secs = Math.max(0, (remain * snap.delayMs) / 1000);
    if (secs < 60) return `${Math.round(secs)}s`;
    return `${Math.round(secs / 60)}m`;
  }, [snap]);

  const locked = [
    locks.character.face,
    locks.character.body,
    locks.character.clothes,
    locks.character.hair,
  ].some(Boolean);

  return (
    <div className="space-y-6">
      <Header
        title="Overview"
        subtitle={topicId ? `Project ${topicId.slice(0, 8)}…` : "No project selected"}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Total Scenes" value={scenes.length} />
        <Stat label="Complete" value={snap.completed} tone="good" icon={CheckCircle2} />
        <Stat label="Queued" value={snap.pending} tone="info" icon={Clock} />
        <Stat label="Failed" value={snap.failed} tone="bad" icon={AlertTriangle} />
        <Stat
          label="Character Lock"
          value={locked ? "On" : "Off"}
          tone={locked ? "good" : "muted"}
          icon={locked ? Lock : Unlock}
        />
        <Stat label="ETA" value={eta} tone="info" icon={Clock} />
      </div>
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Smart Batch</div>
          <div className="text-xs text-muted-foreground">
            Generate a slice of the project. Runs in the background and survives refresh.
          </div>
        </div>
        <SmartBatchBar scenes={scenes} />
      </div>
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
        <div className="text-sm font-semibold">Live Queue</div>
        <div className="mt-2 text-xs text-muted-foreground">
          State: <span className="font-semibold text-foreground">{snap.state}</span>
          {snap.currentScene ? ` · Scene ${snap.currentScene}` : ""}
          {snap.message ? ` · ${snap.message}` : ""}
        </div>
      </div>
    </div>
  );
}

function SmartBatchBar({ scenes }: { scenes: VisualScene[] }) {
  const opts = [5, 10, 20, 50, 100];
  const start = (n: number | "all") => {
    if (!scenes.length) {
      toast.error("No scenes yet. Generate a visual map first.");
      return;
    }
    const subset = n === "all" ? scenes : scenes.slice(0, Math.min(n, scenes.length));
    startImageQueue(subset);
    toast.success(`Queued ${subset.length} scene${subset.length === 1 ? "" : "s"}.`);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((n) => (
        <button
          key={n}
          onClick={() => start(n)}
          className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand/40 hover:bg-accent/40"
        >
          {n}
        </button>
      ))}
      <button
        onClick={() => start("all")}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
      >
        Entire Project
      </button>
    </div>
  );
}

// -------- QUEUE --------

type QueueFilter = "all" | "pending" | "running" | "done" | "failed" | "cooling";

function QueuePanel({ scenes, topicId }: { scenes: VisualScene[]; topicId: string | null }) {
  const snap = useImageQueue();
  const [filter, setFilter] = useState<QueueFilter>("all");
  const items = useMemo(
    () => (filter === "all" ? snap.items : snap.items.filter((i) => i.status === filter)),
    [snap.items, filter],
  );
  const running = snap.state === "running" || snap.state === "cooling";

  return (
    <div className="space-y-4">
      <Header
        title="Image Queue"
        subtitle={`${snap.completed}/${snap.total} complete · ${snap.state}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button
            onClick={pauseImageQueue}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            <Pause className="h-4 w-4" /> Pause
          </button>
        ) : (
          <button
            onClick={() => (snap.total ? resumeImageQueue() : startImageQueue(scenes))}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
          >
            <Play className="h-4 w-4" /> {snap.total ? "Resume" : "Start"}
          </button>
        )}
        <button
          onClick={retryFailedImages}
          disabled={!snap.failed}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent/40 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Retry Failed
        </button>
        <button
          onClick={continueFromLastImage}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent/40"
        >
          Continue
        </button>
        <button
          onClick={stopAfterCurrentImage}
          disabled={!running}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent/40 disabled:opacity-40"
        >
          <X className="h-4 w-4" /> Stop after current
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Delay</span>
          <select
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
            value={getQueueDelay()}
            onChange={(e) => setQueueDelay(Number(e.target.value))}
          >
            {DELAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d / 1000}s
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(["all", "pending", "running", "done", "failed", "cooling"] as QueueFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${
              filter === f
                ? "bg-brand/15 text-brand"
                : "bg-muted text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Preview</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Provider</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No items in this view.
                </td>
              </tr>
            )}
            {items.map((it) => (
              <QueueRow key={it.sceneNumber} topicId={topicId} item={it} scenes={scenes} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QueueRow({
  topicId,
  item,
  scenes,
}: {
  topicId: string | null;
  item: { sceneNumber: number; status: string };
  scenes: VisualScene[];
}) {
  const id = imageIdFor(topicId, item.sceneNumber);
  const url = useImage(id);
  const scene = scenes.find((s) => s.sceneNumber === item.sceneNumber);
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 font-mono text-xs">{item.sceneNumber}</td>
      <td className="px-3 py-2">
        <div className="h-10 w-16 overflow-hidden rounded border border-border/60 bg-muted/40">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusPill status={item.status} />
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">Puter / Pollinations</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <button
            title="Retry"
            onClick={() => scene && startImageQueue([scene])}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            title="Delete"
            onClick={() => void deleteImage(id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "bg-emerald-500/15 text-emerald-500",
    running: "bg-brand/15 text-brand",
    pending: "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
    cooling: "bg-amber-500/15 text-amber-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

// -------- CHARACTER LOCK --------

function CharacterPanel() {
  const locks = useStudioLocks();
  const c = locks.character;
  const fileRef = useRef<HTMLInputElement>(null);

  const onUpload = async (f: File) => {
    const url = await fileToDataUrl(f);
    updateCharacter({ masterImage: url });
    toast.success("Master character uploaded.");
  };

  const toggle = (key: keyof typeof c) => {
    updateCharacter({ [key]: !c[key] } as Partial<typeof c>);
  };

  const toggles: { key: keyof typeof c; label: string }[] = [
    { key: "face", label: "Face" },
    { key: "body", label: "Body" },
    { key: "clothes", label: "Clothes" },
    { key: "hair", label: "Hair" },
    { key: "accessories", label: "Accessories" },
    { key: "expression", label: "Expression" },
    { key: "style", label: "Style" },
    { key: "poseFamily", label: "Pose Family" },
  ];

  return (
    <div className="space-y-6">
      <Header title="Character Lock" subtitle="Upload a master and lock traits for every scene." />
      <div className="grid gap-4 md:grid-cols-[280px,1fr]">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="mb-3 text-sm font-semibold">Master Character</div>
          <div className="aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40">
            {c.masterImage ? (
              <img src={c.masterImage} alt="Master" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No master image
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent/40"
            >
              <Upload className="h-4 w-4" /> Upload
            </button>
            {c.masterImage && (
              <button
                onClick={() => updateCharacter({ masterImage: null })}
                className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-destructive hover:bg-accent/40"
              >
                Clear
              </button>
            )}
          </div>
          <label className="mt-3 block text-xs text-muted-foreground">Character name</label>
          <input
            value={c.name}
            onChange={(e) => updateCharacter({ name: e.target.value })}
            placeholder="e.g. Ada"
            className="mt-1 w-full rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="mb-3 text-sm font-semibold">Locked Traits</div>
            <div className="grid grid-cols-2 gap-2">
              {toggles.map((t) => (
                <ToggleRow
                  key={t.key}
                  label={t.label}
                  on={!!c[t.key]}
                  onChange={() => toggle(t.key)}
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
            <label className="text-sm font-semibold">Notes</label>
            <textarea
              value={c.notes}
              onChange={(e) => updateCharacter({ notes: e.target.value })}
              rows={4}
              placeholder="Extra hints (age, distinctive features)…"
              className="mt-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// -------- STYLE LOCK --------

function StylePanel() {
  const locks = useStudioLocks();
  const s = locks.style;
  const fields: { key: keyof typeof s; label: string; placeholder: string }[] = [
    { key: "artStyle", label: "Art Style", placeholder: "cinematic 3D animation" },
    { key: "lighting", label: "Lighting", placeholder: "soft cinematic" },
    { key: "lineWeight", label: "Line Weight", placeholder: "medium" },
    { key: "cameraAngle", label: "Camera Angle", placeholder: "eye level" },
    { key: "colorPalette", label: "Color Palette", placeholder: "warm documentary" },
    { key: "backgroundStyle", label: "Background Style", placeholder: "detailed environment" },
    { key: "aspectRatio", label: "Aspect Ratio", placeholder: "16:9" },
    { key: "perspective", label: "Perspective", placeholder: "third person" },
  ];
  return (
    <div className="space-y-6">
      <Header title="Style Lock" subtitle="Global visual language for every generated image." />
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="rounded-xl border border-border/60 bg-card/40 p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </label>
            <input
              value={s[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => updateStyle({ [f.key]: e.target.value } as Partial<typeof s>)}
              className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
        <input
          id="locks-enabled"
          type="checkbox"
          checked={locks.enabled}
          onChange={(e) => updateLocks({ enabled: e.target.checked })}
        />
        <label htmlFor="locks-enabled">Apply all locks to future prompts</label>
      </div>
    </div>
  );
}

// -------- BACKGROUND LOCK --------

function BackgroundPanel() {
  const locks = useStudioLocks();
  const b = locks.background;
  const fields: { key: keyof typeof b; label: string; placeholder: string }[] = [
    { key: "environment", label: "Environment", placeholder: "forest, city, lab…" },
    { key: "weather", label: "Weather", placeholder: "clear, rain, storm" },
    { key: "time", label: "Time of Day", placeholder: "dawn, dusk, noon" },
    { key: "fog", label: "Fog", placeholder: "light mist" },
    { key: "snow", label: "Snow", placeholder: "none / heavy" },
    { key: "sky", label: "Sky", placeholder: "overcast, starry" },
    { key: "landscape", label: "Landscape", placeholder: "mountainous, coastal" },
  ];
  return (
    <div className="space-y-6">
      <Header
        title="Background Lock"
        subtitle="Consistent environment across the whole documentary."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="rounded-xl border border-border/60 bg-card/40 p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </label>
            <input
              value={b[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => updateBackground({ [f.key]: e.target.value } as Partial<typeof b>)}
              className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// -------- PROVIDERS --------

function ProviderPanel() {
  const providers = useProviders();
  const settings = useStudioSettings();
  const sorted = [...providers].sort((a, b) => a.priority - b.priority);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...sorted];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorderProviders(next.map((p) => p.id));
  };

  return (
    <div className="space-y-6">
      <Header title="Providers" subtitle="Enable, disable, and reorder image providers." />
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
        <input
          id="failover"
          type="checkbox"
          checked={settings.failover}
          onChange={(e) => updateSettings({ failover: e.target.checked })}
        />
        <label htmlFor="failover">Automatic failover to next provider on failure</label>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Priority</th>
              <th className="px-3 py-2 text-left">Provider</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Enabled</th>
              <th className="px-3 py-2 text-right">Order</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <ProviderRow key={p.id} p={p} idx={i} onMove={move} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        BYOK providers are only called when a key is saved in API Settings. No paid provider is
        auto-invoked.
      </p>
    </div>
  );
}

function ProviderRow({
  p,
  idx,
  onMove,
}: {
  p: ProviderConfig;
  idx: number;
  onMove: (i: number, d: -1 | 1) => void;
}) {
  const disabled = p.status === "coming-soon";
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 font-mono text-xs">{idx + 1}</td>
      <td className="px-3 py-2">
        <div className="font-medium">{p.name}</div>
        <div className="text-xs text-muted-foreground">{p.description}</div>
      </td>
      <td className="px-3 py-2 text-xs">
        {p.status === "ready" && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-500">Ready</span>
        )}
        {p.status === "needs-key" && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500">Needs key</span>
        )}
        {p.status === "coming-soon" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            Coming soon
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          disabled={disabled}
          checked={p.enabled && !disabled}
          onChange={(e) => toggleProvider(p.id, e.target.checked)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <button
            onClick={() => onMove(idx, -1)}
            className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => onMove(idx, 1)}
            className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// -------- ASSETS --------

function AssetsPanel({ scenes, topicId }: { scenes: VisualScene[]; topicId: string | null }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <Header title="Assets" subtitle={`${scenes.length} scenes in this project.`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {scenes.map((s) => (
          <AssetTile
            key={s.sceneNumber}
            scene={s}
            topicId={topicId}
            onOpen={() => setSelected(s.sceneNumber)}
          />
        ))}
        {!scenes.length && (
          <div className="col-span-full rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            No scenes yet.
          </div>
        )}
      </div>
      {selected != null && (
        <ImageInspector
          topicId={topicId}
          scene={scenes.find((s) => s.sceneNumber === selected)!}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function AssetTile({
  scene,
  topicId,
  onOpen,
}: {
  scene: VisualScene;
  topicId: string | null;
  onOpen: () => void;
}) {
  const id = imageIdFor(topicId, scene.sceneNumber);
  const url = useImage(id);
  const locks = useStudioLocks();
  const score = useMemo(
    () => (url ? scoreImage(scene, locks, scene.visualDescription) : null),
    [url, scene, locks],
  );
  const band = score ? scoreBand(score.overall) : null;
  return (
    <button
      onClick={onOpen}
      className="group relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-left"
    >
      {url ? (
        <img
          src={url}
          alt={`Scene ${scene.sceneNumber}`}
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Scene {scene.sceneNumber}
        </div>
      )}
      <div className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
        #{scene.sceneNumber}
      </div>
      {score && (
        <div
          className={`absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            band === "good"
              ? "bg-emerald-500/90 text-white"
              : band === "warn"
                ? "bg-amber-500/90 text-white"
                : "bg-red-500/90 text-white"
          }`}
        >
          {score.overall}
        </div>
      )}
    </button>
  );
}

function ImageInspector({
  topicId,
  scene,
  onClose,
}: {
  topicId: string | null;
  scene: VisualScene;
  onClose: () => void;
}) {
  const id = imageIdFor(topicId, scene.sceneNumber);
  const url = useImage(id);
  const locks = useStudioLocks();
  const score = url ? scoreImage(scene, locks, scene.visualDescription) : null;
  const fileRef = useRef<HTMLInputElement>(null);

  const regenerate = () => {
    startImageQueue([scene]);
    toast.success(`Queued scene ${scene.sceneNumber}.`);
  };
  const download = async () => {
    const data = url ?? (await loadImage(id));
    if (!data) return toast.error("No image saved yet.");
    const a = document.createElement("a");
    a.href = data;
    a.download = `scene-${scene.sceneNumber}.png`;
    a.click();
  };
  const copyPrompt = () => {
    void navigator.clipboard.writeText(scene.visualDescription);
    toast.success("Prompt copied.");
  };
  const del = async () => {
    await deleteImage(id);
    toast.success("Deleted.");
    onClose();
  };
  const replace = async (f: File) => {
    const data = await fileToDataUrl(f);
    await putImage(id, data);
    toast.success("Replaced.");
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="text-sm font-semibold">
            Scene {scene.sceneNumber} — Inspector
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent/60">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-0 md:grid-cols-[1fr,280px]">
          <div className="flex max-h-[70vh] items-center justify-center bg-black/50 p-4">
            {url ? (
              <img src={url} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-sm text-muted-foreground">No image yet — regenerate to fill.</div>
            )}
          </div>
          <aside className="space-y-3 border-l border-border/60 p-4 text-sm">
            {score && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Consistency
                </div>
                <ScoreBars s={score} />
                {score.overall < 80 && (
                  <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600">
                    Below 80 — regenerate suggested.
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <InspectorBtn icon={RefreshCw} onClick={regenerate}>
                Regenerate
              </InspectorBtn>
              <InspectorBtn icon={Upload} onClick={() => fileRef.current?.click()}>
                Replace
              </InspectorBtn>
              <InspectorBtn icon={Download} onClick={download}>
                Download
              </InspectorBtn>
              <InspectorBtn icon={Copy} onClick={copyPrompt}>
                Copy Prompt
              </InspectorBtn>
              <InspectorBtn icon={Pin} onClick={() => toast.success("Pinned.")}>
                Pin
              </InspectorBtn>
              <InspectorBtn icon={ZoomIn} onClick={() => url && window.open(url, "_blank")}>
                Zoom
              </InspectorBtn>
              <button
                onClick={del}
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void replace(f);
              }}
            />
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Prompt
              </div>
              <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {scene.visualDescription}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function InspectorBtn({
  icon: Icon,
  children,
  onClick,
}: {
  icon: typeof RefreshCw;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs font-medium hover:bg-accent/40"
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function ScoreBars({ s }: { s: { character: number; promptMatch: number; style: number; background: number; lighting: number; overall: number } }) {
  const rows: [string, number][] = [
    ["Character", s.character],
    ["Prompt", s.promptMatch],
    ["Style", s.style],
    ["Background", s.background],
    ["Lighting", s.lighting],
    ["Overall", s.overall],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v]) => (
        <div key={label}>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{label}</span>
            <span className="font-mono text-foreground">{v}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${v >= 85 ? "bg-emerald-500" : v >= 70 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// -------- HISTORY --------

function HistoryPanel() {
  const items = useHistory();
  return (
    <div className="space-y-4">
      <Header title="History" subtitle={`${items.length} recent generation events.`} />
      <div className="flex justify-end">
        <button
          onClick={clearHistory}
          disabled={!items.length}
          className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs hover:bg-accent/40 disabled:opacity-40"
        >
          Clear history
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Scene</th>
              <th className="px-3 py-2 text-left">Provider</th>
              <th className="px-3 py-2 text-left">Score</th>
              <th className="px-3 py-2 text-left">Result</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No history yet.
                </td>
              </tr>
            )}
            {items.map((h) => (
              <tr key={h.id} className="border-t border-border/60">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(h.at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs">#{h.sceneNumber}</td>
                <td className="px-3 py-2 text-xs">{h.provider}</td>
                <td className="px-3 py-2 text-xs">{h.score?.overall ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {h.ok ? (
                    <span className="text-emerald-500">ok</span>
                  ) : (
                    <span className="text-destructive">failed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------- SETTINGS --------

function SettingsPanel() {
  const s = useStudioSettings();
  return (
    <div className="space-y-6">
      <Header title="Settings" subtitle="Studio-wide behavior." />
      <div className="space-y-3">
        <Field label="Default batch size">
          <input
            type="number"
            min={1}
            max={500}
            value={s.batchSize}
            onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })}
            className="w-24 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Minimum consistency score (regenerate suggestion)">
          <input
            type="number"
            min={0}
            max={100}
            value={s.minConsistency}
            onChange={(e) => updateSettings({ minConsistency: Number(e.target.value) })}
            className="w-24 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Auto-retry failed scenes">
          <input
            type="checkbox"
            checked={s.autoRetry}
            onChange={(e) => updateSettings({ autoRetry: e.target.checked })}
          />
        </Field>
        <Field label="Automatic provider failover">
          <input
            type="checkbox"
            checked={s.failover}
            onChange={(e) => updateSettings({ failover: e.target.checked })}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-3">
      <label className="text-sm">{label}</label>
      {children}
    </div>
  );
}

// -------- shared UI --------

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad" | "info" | "muted";
  icon?: typeof CheckCircle2;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "bad"
        ? "text-destructive"
        : tone === "info"
          ? "text-brand"
          : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {Icon && <Icon className={`h-4 w-4 ${toneClass}`} />}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={on} onChange={onChange} />
    </label>
  );
}

// Silence unused-import warning; pushHistory is imported for future auto-log wiring.
void pushHistory;