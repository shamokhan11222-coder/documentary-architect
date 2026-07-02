import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, KeyRound, Plug, CheckCircle2, XCircle, CircleDashed, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  API_PROVIDERS,
  useApiKeys,
  saveApiKey,
  deleteApiKey,
  markTested,
} from "@/lib/apikeys";
import {
  useActiveProvider,
  GEMINI_SUPPORTS,
  useProviderSettings,
  saveProviderSettings,
  type ProviderChoice,
} from "@/lib/provider";
import { testProvider } from "@/lib/ai.functions";
import type { ApiProvider } from "@/lib/types";

export const Route = createFileRoute("/api-keys")({
  head: () => ({ meta: [{ title: "API Settings — Documentary Studio" }] }),
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const keys = useApiKeys();
  const active = useActiveProvider();
  const settings = useProviderSettings();
  const runTest = useServerFn(testProvider);
  const [provider, setProvider] = useState<ApiProvider>("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [purpose, setPurpose] = useState("");
  const [modelName, setModelName] = useState("");
  const [status, setStatus] = useState<
    "idle" | "testing" | "connected" | "failed" | "invalid"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");

  function save() {
    if (!apiKey.trim()) {
      toast.error("Enter an API key");
      return;
    }
    saveApiKey({ provider, apiKey: apiKey.trim(), purpose: purpose.trim(), modelName: modelName.trim() });
    setApiKey("");
    setPurpose("");
    setModelName("");
    setStatus("idle");
    toast.success(
      provider === "Google Gemini"
        ? "Gemini key saved — it is now the active provider"
        : "Saved locally",
    );
  }

  async function testConnection() {
    setStatus("testing");
    setStatusMsg("");
    try {
      const r = (await runTest()) as
        | { status: "connected"; model?: string }
        | { status: "failed"; message?: string }
        | { status: "invalid"; message?: string }
        | { status: "lovable" };
      if (r.status === "connected") {
        setStatus("connected");
        setStatusMsg(`Connected to ${r.model ?? "Gemini"}.`);
        const g = keys.find((k) => k.provider === "Google Gemini");
        if (g) markTested(g.id, "Connected");
        toast.success("Gemini connection successful");
      } else if (r.status === "invalid") {
        setStatus("invalid");
        setStatusMsg(r.message ?? "Invalid API key.");
        const g = keys.find((k) => k.provider === "Google Gemini");
        if (g) markTested(g.id, "Invalid Key");
        toast.error("Invalid Gemini API key");
      } else if (r.status === "lovable") {
        setStatus("idle");
        setStatusMsg("No Gemini key configured — using built-in AI.");
      } else {
        setStatus("failed");
        setStatusMsg(r.message ?? "Connection failed.");
        const g = keys.find((k) => k.provider === "Google Gemini");
        if (g) markTested(g.id, "Failed");
        toast.error("Gemini connection failed");
      }
    } catch (e) {
      setStatus("failed");
      setStatusMsg(e instanceof Error ? e.message : "Connection failed.");
    }
  }

  const providerState:
    | "connected"
    | "failed"
    | "invalid"
    | "not_activated"
    | "activated" = !active
    ? "not_activated"
    : status === "connected"
      ? "connected"
      : status === "failed"
        ? "failed"
        : status === "invalid"
          ? "invalid"
          : "activated";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5" />
        <h1 className="text-xl font-semibold">API Settings</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a Google Gemini API key to route every supported task to Gemini using
        your own key. With no Gemini key saved, the studio uses its built-in AI.
      </p>

      <ProviderStatus
        state={providerState}
        message={statusMsg}
        active={!!active}
        onTest={testConnection}
        testing={status === "testing"}
      />

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium">Add provider</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={provider}
            onChange={(e) => setProvider(e.target.value as ApiProvider)}
          >
            {API_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Input placeholder="Model name (e.g. gemini-2.5-flash)" value={modelName} onChange={(e) => setModelName(e.target.value)} className="h-9" />
          <Input placeholder="API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-9" />
          <Input placeholder="Purpose (e.g. voice, images)" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-9" />
        </div>
        <div className="mt-3">
          <Button size="sm" onClick={save}>
            <Plug className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {active && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">Provider routing</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which provider handles each task. Unsupported tasks stay on built-in AI.
          </p>
          <div className="mt-3 space-y-3">
            <RouteRow
              label="Text Provider"
              hint="Topics, research, story, storyboard, SEO, rating"
              supported={GEMINI_SUPPORTS.text}
              value={settings.text}
              onChange={(v) => saveProviderSettings({ text: v })}
            />
            <RouteRow
              label="Image Provider"
              hint={`Images & thumbnails · ${active.imageModel}`}
              supported={GEMINI_SUPPORTS.image}
              value={settings.image}
              onChange={(v) => saveProviderSettings({ image: v })}
            />
            <RouteRow
              label="Voice Provider"
              hint={`Voiceover · ${active.ttsModel}`}
              supported={GEMINI_SUPPORTS.tts}
              value={settings.voice}
              onChange={(v) => saveProviderSettings({ voice: v })}
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.fallback}
              onChange={(e) => saveProviderSettings({ fallback: e.target.checked })}
            />
            Use built-in AI if the external provider fails
          </label>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {keys.length === 0 && (
          <p className="text-sm text-muted-foreground">No providers configured yet.</p>
        )}
        {keys.map((k) => (
          <div key={k.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{k.provider}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {k.modelName || "—"} · {k.purpose || "no purpose set"}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {k.apiKey.slice(0, 3)}••••••••{k.apiKey.slice(-2)}
                </div>
                {k.testResult && (
                  <div className="mt-1 text-[11px] text-amber-600">{k.testResult}</div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => deleteApiKey(k.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderStatus({
  state,
  message,
  active,
  onTest,
  testing,
}: {
  state: "connected" | "failed" | "configured" | "not_configured";
  message: string;
  active: boolean;
  onTest: () => void;
  testing: boolean;
}) {
  const map = {
    connected: { label: "Connected", cls: "text-green-600", icon: CheckCircle2 },
    failed: { label: "Failed", cls: "text-red-600", icon: XCircle },
    configured: { label: "Configured — Gemini active", cls: "text-amber-600", icon: CircleDashed },
    not_configured: { label: "Not Configured — using built-in AI", cls: "text-muted-foreground", icon: CircleDashed },
  } as const;
  const s = map[state];
  const Icon = s.icon;
  return (
    <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${s.cls}`} />
        <div>
          <div className={`text-sm font-medium ${s.cls}`}>Provider status: {s.label}</div>
          {message && <div className="mt-0.5 text-xs text-muted-foreground">{message}</div>}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onTest} disabled={!active || testing}>
        {testing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Test Connection
      </Button>
    </div>
  );
}
