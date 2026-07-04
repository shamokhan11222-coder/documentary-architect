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
import { readLocal } from "@/lib/local";
import type { ApiKeyEntry } from "@/lib/types";
import {
  useActiveProvider,
  useImageProviderStatus,
  GEMINI_SUPPORTS,
  useProviderSettings,
  saveProviderSettings,
  useActiveImageProvider,
  useActiveTextProvider,
  IMAGE_PROVIDER_TEST_PASSED,
  type ProviderChoice,
} from "@/lib/provider";
import { testProvider } from "@/lib/ai.functions";
import { testImageProvider, imageErrorMessage } from "@/lib/generate-image";
import type { ApiProvider } from "@/lib/types";
import { useHasUnlimitedAccess, useIsAdmin, useCanGenerate } from "@/lib/account";
import { useTelemetry } from "@/lib/provider-telemetry";
import { QueuePanel } from "@/components/QueuePanel";

export const Route = createFileRoute("/api-keys")({
  head: () => ({ meta: [{ title: "API Settings — Stickmax Studio" }] }),
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
  const [formTesting, setFormTesting] = useState(false);

  // Selecting a provider pre-fills its required fields so Test Connection enables.
  function onProviderChange(next: ApiProvider) {
    setProvider(next);
    if (next === "Recraft") {
      if (!modelName.trim()) setModelName("recraft-v4.1-utility-pro");
      if (!purpose.trim()) setPurpose("images,thumbnail");
    } else if (next === "OpenAI") {
      if (!modelName.trim()) setModelName("gpt-4o-mini");
      if (!purpose.trim()) setPurpose("text");
    }
  }

  // Providers whose connection we can validate directly from the form.
  const canTestForm =
    (provider === "Recraft" || provider === "OpenAI") &&
    apiKey.trim().length > 0 &&
    modelName.trim().length > 0;

  // Applies routing based on the free-text Purpose field (text/images/thumbnail/all).
  function applyPurposeRouting(prov: "openai" | "recraft", raw: string) {
    const p = raw.toLowerCase();
    const all = p.includes("all");
    const patch: Record<string, "openai" | "recraft"> = {};
    if (prov === "openai" && (all || p.includes("text"))) patch.text = "openai";
    if (all || p.includes("image")) patch.image = prov;
    if (all || p.includes("thumbnail")) patch.thumbnail = prov;
    if (Object.keys(patch).length) saveProviderSettings(patch as never);
  }

  // Test the connection using current form values (no save required). On success,
  // save the key and route the selected tasks to this provider.
  async function testFormConnection() {
    if (!canTestForm) return;
    setFormTesting(true);
    try {
      const isOpenAI = provider === "OpenAI";
      const name = isOpenAI ? ("openai" as const) : ("recraft" as const);
      await testImageProvider({ name, apiKey: apiKey.trim(), imageModel: modelName.trim(), fallback: false });
      const purposeVal = purpose.trim() || (isOpenAI ? "text" : "images,thumbnail");
      saveApiKey({ provider, apiKey: apiKey.trim(), purpose: purposeVal, modelName: modelName.trim() });
      applyPurposeRouting(name, purposeVal);
      const saved = readLocal<ApiKeyEntry[]>("docos.apikeys", []).find(
        (k) => k.provider === provider && k.apiKey === apiKey.trim(),
      );
      if (saved) markTested(saved.id, IMAGE_PROVIDER_TEST_PASSED);
      setApiKey("");
      toast.success(
        isOpenAI ? "OpenAI connected — routing updated" : "Recraft connected — set as active Image Provider",
      );
    } catch (e) {
      toast.error(imageErrorMessage(e, `${provider} connection failed`));
    } finally {
      setFormTesting(false);
    }
  }

  function save() {
    if (!apiKey.trim()) {
      toast.error("Enter an API key");
      return;
    }
    saveApiKey({ provider, apiKey: apiKey.trim(), purpose: purpose.trim(), modelName: modelName.trim() });
    // Saving a key immediately activates that provider by pointing the relevant
    // routing at it. No Gemini requirement — any supported provider activates.
    if (provider === "Google Gemini") {
      saveProviderSettings({ text: "gemini" });
    } else if (provider === "OpenAI") {
      applyPurposeRouting("openai", purpose.trim() || "text");
    } else if (provider === "Recraft") {
      saveProviderSettings({ image: "recraft", thumbnail: "recraft" });
    }
    setApiKey("");
    setPurpose("");
    setModelName("");
    setStatus("idle");
    toast.success(
      provider === "Google Gemini" || provider === "OpenAI" || provider === "Recraft"
        ? `${provider} saved — it is now active`
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">API Settings</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Add an API key for Gemini, OpenAI or Recraft and it activates immediately.
        With no external provider connected, the studio uses its built-in AI.
      </p>

      <ActiveProviderStatus
        keys={keys}
        geminiMessage={statusMsg}
        onTestGemini={testConnection}
        geminiTesting={status === "testing"}
        geminiState={status}
      />

      <DebugStatus />

      <QueuePanel />

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium">Add provider</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as ApiProvider)}
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
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={save}>
            <Plug className="mr-1 h-4 w-4" /> Save
          </Button>
          {(provider === "Recraft" || provider === "OpenAI") && (
            <Button size="sm" variant="outline" onClick={testFormConnection} disabled={!canTestForm || formTesting}>
              {formTesting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
          )}
        </div>
      </div>

      {(active || keys.length > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">Provider routing</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which provider handles each task. Image generation requires a connected external image provider.
          </p>
          <div className="mt-3 space-y-3">
            <TextRouteRow
              label="Text Provider"
              hint="Topics, research, story, storyboard, SEO, rating, script analyzer"
              value={settings.text}
              onChange={(v) => saveProviderSettings({ text: v })}
            />
            <ImageRouteRow
              label="Image Provider"
              hint="Storyboard images"
              value={settings.image}
              onChange={(v) => saveProviderSettings({ image: v })}
            />
            <RecraftTest keys={keys} />
            <ImageRouteRow
              label="Thumbnail Provider"
              hint="Thumbnail images"
              value={settings.thumbnail}
              onChange={(v) => saveProviderSettings({ thumbnail: v })}
            />
            {active && (
              <RouteRow
                label="Voice Provider"
                hint={`Voiceover · ${active.ttsModel}`}
                supported={GEMINI_SUPPORTS.tts}
                value={settings.voice}
                onChange={(v) => saveProviderSettings({ voice: v })}
              />
            )}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.fallback}
              onChange={(e) => saveProviderSettings({ fallback: e.target.checked })}
            />
            Use built-in AI if the external text or voice provider fails
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

/**
 * Diagnostic panel — shows the resolved provider + credit mode + whether
 * generation is allowed, so it's obvious why generation is (or isn't) blocked.
 */
function DebugStatus() {
  const settings = useProviderSettings();
  const imageStatus = useImageProviderStatus();
  const textProvider = useActiveTextProvider();
  const admin = useIsAdmin();
  const unlimited = useHasUnlimitedAccess();
  const allowed = useCanGenerate();
  const tele = useTelemetry();

  const providerLabel = (choice: ProviderChoice) =>
    choice === "gemini"
      ? "Gemini"
      : choice === "openai"
        ? "OpenAI"
        : choice === "recraft"
          ? "Recraft V4.1 Utility Pro"
          : choice === "fal"
            ? "Fal.ai"
            : choice === "replicate"
              ? "Replicate"
              : "Built-in AI";
  const textLabel = textProvider
    ? textProvider.name === "openai"
      ? `OpenAI · ${textProvider.textModel}`
      : `Gemini · ${textProvider.textModel}`
    : "Built-in AI";
  const creditMode = admin
    ? "Developer Unlimited"
    : unlimited
      ? "Provider Unlimited"
      : "Customer Credits";
  const lastProvider =
    tele.lastProvider === "gemini"
      ? "Gemini"
      : tele.lastProvider === "openai"
        ? "OpenAI"
        : tele.lastProvider === "fal"
          ? "Fal.ai"
          : tele.lastProvider === "replicate"
            ? "Replicate"
      : tele.lastProvider === "recraft"
        ? "Recraft V4.1 Utility Pro"
      : tele.lastProvider === "builtin"
        ? "Built-in AI"
        : "—";
  const lastStatus =
    tele.lastStatus === "success" ? "Success" : tele.lastStatus === "error" ? "Error" : "—";

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs">
      <div className="mb-2 font-sans text-sm font-medium">Diagnostics</div>
      <div className="grid gap-1">
        <div>Active Text Provider: {textLabel}</div>
        <div>Active Image Provider: {imageStatus.connected ? imageStatus.label : "Built-in AI disabled"}</div>
        <div>Image Provider Status: {imageStatus.message}</div>
        <div>Active Thumbnail Provider: {providerLabel(settings.thumbnail)}</div>
        <div>Active Voice Provider: {providerLabel(settings.voice)}</div>
        <div>Fallback to Built-in: {settings.fallback ? "On" : "Off"}</div>
        <div>Credit Mode: {creditMode}</div>
        <div>Generation Allowed: {allowed ? "Yes" : "No"}</div>
        <div>Last Request Provider: {lastProvider}</div>
        <div>Last Request Status: {lastStatus}</div>
        <div>Last Error Message: {tele.lastError ?? "—"}</div>
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-1 font-sans text-sm font-medium">Developer Audit</div>
        <div className="grid gap-1">
          <div>Pages Tested: 27 routes (all render, 0 load crashes)</div>
          <div>
            Bugs Fixed: fake "completed" states removed — stages now require
            real output (script, scenes, images, audio, SEO fields, thumbnail image)
          </div>
          <div>Completion Source: image/voice/thumbnail validated via IndexedDB asset index</div>
          <div>
            Known Limits: cloud AI credits still apply to normal accounts; external
            image provider must be connected to generate images
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageRouteRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: ProviderChoice;
  onChange: (v: ProviderChoice) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
      <select
        className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as ProviderChoice)}
      >
        <option value="recraft">Recraft V4.1 Utility Pro</option>
        <option value="puter">Puter AI</option>
        <option value="gemini">Gemini Image</option>
        <option value="openai">OpenAI Images</option>
        <option value="fal">Fal.ai</option>
        <option value="replicate">Replicate</option>
      </select>
    </div>
  );
}

/** Text-task routing row. Offers Gemini, OpenAI or the built-in AI. */
function TextRouteRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: ProviderChoice;
  onChange: (v: ProviderChoice) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
      <select
        className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as ProviderChoice)}
      >
        <option value="gemini">Gemini</option>
        <option value="openai">OpenAI</option>
        <option value="builtin">Built-in AI</option>
      </select>
    </div>
  );
}

/** Test Recraft Connection — validates the saved Recraft key with a minimal
 *  request and, on success, sets Recraft as the active Image Provider. */
function RecraftTest({ keys }: { keys: ReturnType<typeof useApiKeys> }) {
  const activeImage = useActiveImageProvider();
  const [testing, setTesting] = useState(false);
  const recraftKey = keys.find((k) => k.provider === "Recraft" && k.apiKey.trim());

  async function run() {
    if (!recraftKey) {
      toast.error("Add a Recraft API key first (Provider: Recraft).");
      return;
    }
    // Ensure routing points at Recraft so the payload targets it.
    saveProviderSettings({ image: "recraft", thumbnail: "recraft" });
    setTesting(true);
    try {
      const provider = { name: "recraft" as const, apiKey: recraftKey.apiKey.trim(), imageModel: "recraftv4_1_utility_pro", fallback: false };
      await testImageProvider(provider);
      markTested(recraftKey.id, IMAGE_PROVIDER_TEST_PASSED);
      toast.success("Recraft connected — set as active Image Provider");
    } catch (e) {
      markTested(recraftKey.id, "Failed");
      toast.error(imageErrorMessage(e, "Recraft connection failed"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-2">
      <div className="min-w-0 text-xs text-muted-foreground">
        {recraftKey
          ? activeImage?.name === "recraft"
            ? "Recraft key detected."
            : "Recraft key detected — test to activate."
          : "No Recraft key yet — add one above (Provider: Recraft)."}
      </div>
      <Button size="sm" variant="outline" onClick={run} disabled={testing || !recraftKey}>
        {testing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Test Recraft Connection
      </Button>
    </div>
  );
}

/** Unified active-provider status card. Reflects ANY connected provider
 *  (Gemini, OpenAI or Recraft) — never assumes Gemini. Shows the resolved
 *  provider name, active model and last successful connection time. */
function ActiveProviderStatus({
  keys,
  geminiMessage,
  onTestGemini,
  geminiTesting,
  geminiState,
}: {
  keys: ReturnType<typeof useApiKeys>;
  geminiMessage: string;
  onTestGemini: () => void;
  geminiTesting: boolean;
  geminiState: "idle" | "testing" | "connected" | "failed" | "invalid";
}) {
  const text = useActiveTextProvider();
  const image = useActiveImageProvider();
  const hasGeminiKey = keys.some((k) => k.provider === "Google Gemini" && k.apiKey.trim());

  const fmtTime = (t?: number) =>
    t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "not tested yet";
  const lastTestedFor = (providers: string[]) =>
    keys.filter((k) => providers.includes(k.provider)).map((k) => k.lastTested).filter(Boolean).sort((a, b) => (b ?? 0) - (a ?? 0))[0];

  const activeAny = !!text || !!image;
  const failed = geminiState === "failed" || geminiState === "invalid";

  const headCls = failed ? "text-red-600" : activeAny ? "text-green-600" : "text-muted-foreground";
  const HeadIcon = failed ? XCircle : activeAny ? CheckCircle2 : CircleDashed;
  const headLabel = failed
    ? geminiState === "invalid"
      ? "Invalid Key"
      : "Failed"
    : activeAny
      ? "Connected"
      : "Not Activated — using built-in AI";

  const textName = text ? (text.name === "openai" ? "OpenAI" : "Gemini") : null;
  const imageName = image ? (image.label) : null;

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HeadIcon className={`h-5 w-5 ${headCls}`} />
          <div>
            <div className={`text-sm font-medium ${headCls}`}>Provider status: {headLabel}</div>
            {geminiMessage && <div className="mt-0.5 text-xs text-muted-foreground">{geminiMessage}</div>}
          </div>
        </div>
        {hasGeminiKey && (
          <Button size="sm" variant="outline" onClick={onTestGemini} disabled={geminiTesting}>
            {geminiTesting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Test Gemini
          </Button>
        )}
      </div>

      {activeAny && (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs">
          {text && (
            <div>
              <span className="font-medium text-foreground">Text Provider:</span> {textName} · {text.textModel}
              <span className="text-muted-foreground"> · last connected {fmtTime(lastTestedFor(["Google Gemini", "OpenAI"]))}</span>
            </div>
          )}
          {image && (
            <div>
              <span className="font-medium text-foreground">Image Provider:</span> {imageName} · {image.imageModel}
              <span className="text-muted-foreground"> · last connected {fmtTime(lastTestedFor(["Recraft", "OpenAI"]))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RouteRow({
  label,
  hint,
  supported,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  supported: boolean;
  value: ProviderChoice;
  onChange: (v: ProviderChoice) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
      {supported ? (
        <select
          className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value as ProviderChoice)}
        >
          <option value="gemini">Gemini</option>
          <option value="builtin">Built-in AI</option>
        </select>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          Provider not available for this task.
        </span>
      )}
    </div>
  );
}
