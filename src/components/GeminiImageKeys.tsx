// API Settings: manage multiple Gemini image API keys for rotation.
import { useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listGeminiModels, type GeminiModelInfo } from "@/lib/generate-image";
import {
  useGeminiImageKeys,
  addGeminiImageKey,
  removeGeminiImageKey,
  reactivateGeminiImageKey,
  type GeminiImageKey,
} from "@/lib/gemini-image-keys";

const DAY_MS = 24 * 60 * 60 * 1000;

function maskKey(key: string) {
  const k = key.trim();
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

function cooldownLabel(until: number | null) {
  if (!until) return "";
  const ms = Math.max(0, until - Date.now());
  if (ms >= 60 * 60 * 1000) return `~${Math.ceil(ms / (60 * 60 * 1000))}h`;
  return `~${Math.max(1, Math.ceil(ms / 60000))}m`;
}

function statusBadge(k: GeminiImageKey) {
  if (k.status === "disabled") return <span className="text-red-600">Disabled</span>;
  if (k.status === "cooling") {
    // A long cooldown (daily quota parked until tomorrow) reads as "Exhausted".
    const remaining = k.cooldownUntil ? k.cooldownUntil - Date.now() : 0;
    if (remaining > DAY_MS - 60 * 60 * 1000) {
      return <span className="text-red-500">Exhausted (resets {cooldownLabel(k.cooldownUntil)})</span>;
    }
    return <span className="text-amber-600">Cooling Down ({cooldownLabel(k.cooldownUntil)})</span>;
  }
  return <span className="text-green-600">Ready</span>;
}

export function GeminiImageKeys() {
  const keys = useGeminiImageKeys();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // When a key is entered, detect the image-capable models it can access and
  // auto-select the first compatible one. No manual model IDs allowed.
  useEffect(() => {
    const k = key.trim();
    setModels([]);
    setModel("");
    setModelError(null);
    if (k.length < 10) return;
    let cancelled = false;
    setLoadingModels(true);
    const t = setTimeout(async () => {
      try {
        const list = await listGeminiModels(k);
        if (cancelled) return;
        setModels(list.imageModels);
        setModel(list.imageModels[0]?.id ?? "");
        if (list.imageModels.length === 0) setModelError("This key has no image-capable Gemini models.");
      } catch (e) {
        if (cancelled) return;
        setModels([]);
        setModelError(e instanceof Error ? e.message : "Could not load models for this key.");
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key]);

  function add() {
    if (!key.trim() || !model) return;
    addGeminiImageKey(name, key, model);
    setName("");
    setKey("");
    setModel("");
    setModels([]);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" />
        <div className="text-sm font-medium">Gemini Image Keys (rotation)</div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Image generation uses these Gemini keys only, one at a time. When a key hits a quota / rate limit it cools down
        and the next available key is used automatically.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
        <Input placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Gemini API key" value={key} onChange={(e) => setKey(e.target.value)} type="password" />
        <Select value={model} onValueChange={setModel} disabled={models.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder={loadingModels ? "Detecting models…" : "Image model"} />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName || m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={!key.trim() || !model || loadingModels}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {(loadingModels || modelError) && (
        <div className={`mt-2 text-xs ${modelError ? "text-red-600" : "text-muted-foreground"}`}>
          {loadingModels ? "Detecting supported image models for this key…" : modelError}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {keys.length === 0 && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            No Gemini image keys yet. Add at least one to enable rotation.
          </div>
        )}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{k.name}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{maskKey(k.key)}</span>
              </div>
              <div className="text-muted-foreground">
                {statusBadge(k)} · fails: {k.failCount} ·{" "}
                {k.lastUsed ? `last used ${new Date(k.lastUsed).toLocaleTimeString()}` : "never used"}
                {k.disabledReason ? ` · ${k.disabledReason}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {k.status !== "active" && (
                <Button size="sm" variant="ghost" className="h-7" onClick={() => reactivateGeminiImageKey(k.id)}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Reactivate
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => removeGeminiImageKey(k.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
