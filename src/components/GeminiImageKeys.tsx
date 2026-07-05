// API Settings: manage multiple Gemini image API keys for rotation.
import { useState } from "react";
import { Plus, Trash2, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGeminiImageKeys,
  addGeminiImageKey,
  removeGeminiImageKey,
  reactivateGeminiImageKey,
  type GeminiImageKey,
} from "@/lib/gemini-image-keys";

function statusBadge(k: GeminiImageKey) {
  if (k.status === "cooling") {
    const left = k.cooldownUntil ? Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 60000)) : 0;
    return <span className="text-amber-600">Cooling down (~{left}m)</span>;
  }
  if (k.status === "disabled") return <span className="text-red-600">Disabled</span>;
  return <span className="text-green-600">Active</span>;
}

export function GeminiImageKeys() {
  const keys = useGeminiImageKeys();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");

  function add() {
    if (!key.trim()) return;
    addGeminiImageKey(name, key, model);
    setName("");
    setKey("");
    setModel("");
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
        <Input placeholder="Image model (optional)" value={model} onChange={(e) => setModel(e.target.value)} />
        <Button onClick={add} disabled={!key.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {keys.length === 0 && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            No Gemini image keys yet. Add at least one to enable rotation.
          </div>
        )}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="truncate font-medium">{k.name}</div>
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
