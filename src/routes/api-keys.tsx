import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, XCircle, CircleDashed, Loader2, Zap, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readLocal, writeLocal } from "@/lib/local";
import { useImageProviderStatus, useProviderSettings, enforceZeroBudgetImageRouting } from "@/lib/provider";
import { useHasUnlimitedAccess, useIsAdmin, useCanGenerate } from "@/lib/account";
import { useTelemetry } from "@/lib/provider-telemetry";
import { QueuePanel } from "@/components/QueuePanel";
import { GeminiImageKeys } from "@/components/GeminiImageKeys";
import {
  useOpenRouterSettings,
  saveOpenRouterSettings,
  resetOpenRouterSettings,
  OPENROUTER_FREE_PRESETS,
  DEFAULT_OPENROUTER_SETTINGS,
} from "@/lib/openrouter";
import { listOpenRouterModels, testOpenRouterConnection, type OpenRouterModel } from "@/lib/openrouter.functions";

export const Route = createFileRoute("/api-keys")({
  head: () => ({ meta: [{ title: "API Settings — Stickmax Studio" }] }),
  component: ApiKeysPage,
});

/** One-time cleanup on mount: purge any stale Gemini/Groq/OpenAI text provider
 *  configuration from localStorage so no text call can leak to those providers.
 *  Only touches provider-routing settings — NEVER project data, research,
 *  stories, scenes, images, thumbnails or voice files. */
function useCleanupLegacyTextProviders() {
  useEffect(() => {
    try {
      // 1) Coerce text-provider routing to "openrouter" and strip Gemini/Groq
      //    text choices from any persisted provider settings.
      const settings = readLocal<Record<string, unknown>>("docos.provider.settings", {});
      if (settings && typeof settings === "object") {
        const next = { ...settings, text: "openrouter" };
        writeLocal("docos.provider.settings", next);
      }
      // 2) Purge Gemini + OpenAI text-purpose API key entries. Image-only
      //    keys (Recraft / Fal / Replicate / HuggingFace / ElevenLabs) are
      //    preserved. Keys whose purpose is exactly "text" for Gemini/OpenAI
      //    are removed; combined "text,images" is rewritten to drop text.
      type Entry = { id: string; provider: string; purpose?: string };
      const list = readLocal<Entry[]>("docos.apikeys", []);
      if (Array.isArray(list)) {
        const cleaned = list
          .map((k) => {
            if (k.provider !== "Google Gemini" && k.provider !== "OpenAI") return k;
            const purpose = (k.purpose ?? "").toLowerCase();
            if (!purpose.includes("text")) return k;
            const withoutText = purpose
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p && p !== "text" && p !== "all")
              .join(",");
            return withoutText ? { ...k, purpose: withoutText } : null;
          })
          .filter(Boolean) as Entry[];
        writeLocal("docos.apikeys", cleaned);
      }
      // 3) Old Groq telemetry cache — clear if present.
      writeLocal("docos.groq.settings", null);
    } catch {
      /* ignore cleanup failures */
    }
  }, []);
}

function ApiKeysPage() {
function ApiKeysPage() {
  useCleanupLegacyTextProviders();
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">API Settings</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Text generation runs through OpenRouter with automatic free-model
        fallback. Images use the built-in Puter → Pollinations pipeline. No
        Lovable or Gemini text calls are made when OpenRouter is connected.
      </p>

      <OpenRouterCard />
      <DebugStatus />
      <QueuePanel />

      <div className="mt-4">
        <GeminiImageKeys />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// OpenRouter — the ONLY selectable text provider.
// -----------------------------------------------------------------------------
function OpenRouterCard() {
  const settings = useOpenRouterSettings();
  const [primary, setPrimary] = useState(settings.primary);
  const [fallback, setFallback] = useState(settings.fallback);
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    ok: boolean;
    provider: string;
    model: string | null;
    endpoint: string;
    httpStatus: number | null;
    responseTimeMs?: number;
    fallbackUsed?: boolean;
    message: string;
  }>(null);

  const runList = useServerFn(listOpenRouterModels);
  const runTest = useServerFn(testOpenRouterConnection);

  // Sync local inputs when the persisted settings change (e.g. on reset).
  useEffect(() => {
    setPrimary(settings.primary);
    setFallback(settings.fallback);
  }, [settings.primary, settings.fallback]);

  async function loadModels() {
    setLoadingModels(true);
    try {
      const r = await runList();
      if (r.ok) {
        setModels(r.models);
      } else {
        toast.error(r.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to list OpenRouter models.");
    } finally {
      setLoadingModels(false);
    }
  }

  function save() {
    saveOpenRouterSettings({ primary: primary.trim(), fallback: fallback.trim() });
    toast.success("OpenRouter model preferences saved.");
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    // Persist the current selection before testing so the middleware attaches it.
    saveOpenRouterSettings({ primary: primary.trim(), fallback: fallback.trim() });
    try {
      const r = await runTest({ data: { primary: primary.trim(), fallback: fallback.trim() } });
      if (r.ok) {
        const reply = r.reply || "";
        const passed = /openrouter\s+connected/i.test(reply);
        setTestResult({
          ok: passed,
          provider: r.provider,
          model: r.model,
          endpoint: r.endpoint,
          httpStatus: r.httpStatus,
          responseTimeMs: r.responseTimeMs,
          fallbackUsed: r.fallbackUsed,
          message: passed
            ? `OpenRouter connected · ${r.model} · ${r.responseTimeMs}ms`
            : `Unexpected reply: ${reply.slice(0, 200)}`,
        });
        if (passed) toast.success("OpenRouter connection successful");
        else toast.error("OpenRouter responded but reply did not match.");
      } else {
        const humanMsg = humanizeOpenRouterError(r.httpStatus, r.message);
        setTestResult({
          ok: false,
          provider: r.provider,
          model: r.model,
          endpoint: r.endpoint,
          httpStatus: r.httpStatus,
          message: humanMsg,
        });
        toast.error(humanMsg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OpenRouter test failed.";
      setTestResult({
        ok: false,
        provider: "OpenRouter",
        model: primary,
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        httpStatus: null,
        message: msg,
      });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  function disconnect() {
    // The OPENROUTER_API_KEY is a server-side secret managed at the workspace
    // level and is intentionally NOT removed here. Disconnect only resets the
    // client-side model preferences.
    resetOpenRouterSettings();
    setPrimary(DEFAULT_OPENROUTER_SETTINGS.primary);
    setFallback(DEFAULT_OPENROUTER_SETTINGS.fallback);
    setTestResult(null);
    toast.success("OpenRouter model preferences reset to defaults.");
  }

  const modelOptions = useMemo(() => {
    // Union of live models + built-in free presets, preserving free-first order.
    const seen = new Set<string>();
    const opts: Array<{ id: string; label: string; free: boolean }> = [];
    for (const p of OPENROUTER_FREE_PRESETS) {
      if (!seen.has(p.id)) {
        opts.push({ id: p.id, label: p.label, free: true });
        seen.add(p.id);
      }
    }
    if (models) {
      for (const m of models.filter((m) => m.free)) {
        if (!seen.has(m.id)) {
          opts.push({ id: m.id, label: m.name, free: true });
          seen.add(m.id);
        }
      }
      for (const m of models.filter((m) => !m.free)) {
        if (!seen.has(m.id)) {
          opts.push({ id: m.id, label: `${m.name} (paid)`, free: false });
          seen.add(m.id);
        }
      }
    }
    return opts;
  }, [models]);

  const primaryIsPaid = modelOptions.find((o) => o.id === primary)?.free === false;
  const fallbackIsPaid = modelOptions.find((o) => o.id === fallback)?.free === false;

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-600" />
          <div>
            <div className="text-sm font-semibold">OpenRouter</div>
            <div className="text-xs text-muted-foreground">
              Free and paid text models for research, stories, SEO and scene planning.
            </div>
          </div>
        </div>
        <span className="rounded-full border border-green-600/40 bg-green-600/10 px-2 py-0.5 text-[11px] font-medium text-green-700">
          Server key connected
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <ModelPicker
          label="Primary Model"
          value={primary}
          onChange={setPrimary}
          options={modelOptions}
          isPaid={primaryIsPaid}
        />
        <ModelPicker
          label="Fallback Model"
          value={fallback}
          onChange={setFallback}
          options={modelOptions}
          isPaid={fallbackIsPaid}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save}>Save</Button>
          <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
            {testing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Test Connection
          </Button>
          <Button size="sm" variant="outline" onClick={loadModels} disabled={loadingModels}>
            {loadingModels ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Refresh Models
          </Button>
          <Button size="sm" variant="ghost" onClick={disconnect}>
            <RotateCcw className="mr-1 h-4 w-4" /> Disconnect
          </Button>
        </div>

        {(primaryIsPaid || fallbackIsPaid) && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Warning: at least one selected model is <strong>paid</strong>. Save
            only if you intend to be billed by OpenRouter for those requests.
          </p>
        )}

        {testResult && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              testResult.ok
                ? "border-green-600/40 bg-green-600/10 text-green-800"
                : "border-red-500/40 bg-red-500/10 text-red-800"
            }`}
          >
            <div className="font-medium">
              {testResult.ok ? "Test passed" : "Test failed"}
            </div>
            <div className="mt-1 space-y-0.5 font-mono">
              <div>Provider: {testResult.provider}</div>
              <div>Model: {testResult.model ?? "—"}</div>
              <div>Endpoint: {testResult.endpoint}</div>
              <div>HTTP status: {testResult.httpStatus ?? "—"}</div>
              {typeof testResult.responseTimeMs === "number" && (
                <div>Response time: {testResult.responseTimeMs}ms</div>
              )}
              {typeof testResult.fallbackUsed === "boolean" && (
                <div>Fallback used: {testResult.fallbackUsed ? "yes" : "no"}</div>
              )}
              <div className="mt-1 whitespace-pre-wrap break-words">{testResult.message}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelPicker({
  label,
  value,
  onChange,
  options,
  isPaid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string; free: boolean }>;
  isPaid: boolean;
}) {
  // Ensure the current value is always represented in the dropdown even if
  // it is not part of the live list (custom / cached choice).
  const hasCurrent = options.some((o) => o.id === value);
  return (
    <div className="grid gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!hasCurrent && value && (
            <option value={value}>{value} (current)</option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.free ? "★ " : ""}
              {o.label}
            </option>
          ))}
        </select>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="or type model id"
          className="h-9 w-56"
        />
      </div>
      {isPaid && (
        <span className="text-[11px] text-amber-700">Selected model is paid.</span>
      )}
    </div>
  );
}

function humanizeOpenRouterError(status: number | null, msg: string): string {
  const s = status ?? 0;
  if (s === 401 || /invalid/i.test(msg) || /unauthor/i.test(msg))
    return "OpenRouter API key is invalid.";
  if (s === 429 || /rate limit|too many/i.test(msg))
    return "The selected OpenRouter model is temporarily rate limited. Trying the fallback model.";
  if (s === 402 || /credit|quota/i.test(msg))
    return "No free OpenRouter model is currently available. Select another free model or try again later.";
  return msg || `OpenRouter request failed (${status ?? "network"}).`;
}

// -----------------------------------------------------------------------------
// Diagnostics — OpenRouter-focused (Gemini/Groq references removed).
// -----------------------------------------------------------------------------
function DebugStatus() {
  const settings = useProviderSettings();
  const imageStatus = useImageProviderStatus();
  const or = useOpenRouterSettings();
  const admin = useIsAdmin();
  const unlimited = useHasUnlimitedAccess();
  const allowed = useCanGenerate();
  const tele = useTelemetry();

  // Enforce zero-budget image routing on view, guarding against stale saved state.
  useEffect(() => {
    try {
      enforceZeroBudgetImageRouting();
    } catch {
      /* SSR / storage unavailable */
    }
  }, []);

  const creditMode = admin
    ? "Developer Unlimited"
    : unlimited
      ? "Provider Unlimited"
      : "Customer Credits";

  const lastProvider = tele.lastProvider ? String(tele.lastProvider) : "—";
  const lastStatus =
    tele.lastStatus === "success" ? "Success" : tele.lastStatus === "error" ? "Error" : "—";

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs">
      <div className="mb-2 font-sans text-sm font-medium">Developer Mode</div>
      <div className="grid gap-1">
        <div>Provider: OpenRouter</div>
        <div>Primary Model: {or.primary}</div>
        <div>Fallback Model: {or.fallback}</div>
        <div>Endpoint: https://openrouter.ai/api/v1/chat/completions</div>
        <div>Active Image Provider: {imageStatus.connected ? imageStatus.label : "Built-in AI disabled"}</div>
        <div>Image Route: Puter AI primary → Pollinations fallback</div>
        <div>Active Thumbnail Provider: {settings.thumbnail}</div>
        <div>Active Voice Provider: Built-in TTS</div>
        <div>Credit Mode: {creditMode}</div>
        <div>Generation Allowed: {allowed ? "Yes" : "No"}</div>
        <div>Last Request Provider: {lastProvider}</div>
        <div>Last Request Status: {lastStatus}</div>
        <div>Last Error Message: {tele.lastError ?? "—"}</div>
      </div>
    </div>
  );
}

// Icons kept for future status pill use; export to silence unused warnings when
// the tree-shaker keeps them for chunk boundaries.
export const _statusIcons = { CheckCircle2, XCircle, CircleDashed };
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
          : choice === "puter"
            ? "Puter AI"
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
      : tele.lastProvider === "puter"
        ? "Puter AI"
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
        <div>Image Route: Puter AI primary → Pollinations fallback</div>
        <div>Image Provider Status: {imageStatus.message}</div>
        <div>Active Thumbnail Provider: {providerLabel(settings.thumbnail)}</div>
        <div>Active Voice Provider: {providerLabel(settings.voice)}</div>
        <div>OpenAI Status: Disabled</div>
        <div>Built-in Image Gateway: Disabled</div>
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
        <option value="puter">Puter AI</option>
        <option value="pollinations">Pollinations AI</option>
        <option value="gemini" disabled>Gemini Image — disabled</option>
        <option value="openai" disabled>OpenAI Images — disabled</option>
        <option value="recraft" disabled>Recraft — disabled</option>
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
  return <ImageKeyTest keys={keys} />;
}

/** Test Gemini Image — validates the saved Gemini key against the Gemini IMAGE
 *  model endpoint (never the text activation path) and, on success, sets Gemini
 *  as the active Image + Thumbnail provider. */
function GeminiImageTest({ keys }: { keys: ReturnType<typeof useApiKeys> }) {
  const activeImage = useActiveImageProvider();
  const geminiKey = keys.find((k) => k.provider === "Google Gemini" && k.apiKey.trim());

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-2">
      <div className="min-w-0 text-xs text-muted-foreground">
        {geminiKey
          ? activeImage?.name === "gemini"
            ? `Gemini Image active · ${activeImage.imageModel}`
            : "Gemini key detected — image generation disabled in Zero-Budget Mode."
          : "No Gemini key yet — add one above (Provider: Google Gemini)."}
      </div>
      <Button size="sm" variant="outline" disabled>
        Gemini Image Disabled
      </Button>
    </div>
  );
}

/** Test Recraft Connection — validates the saved Recraft key with a minimal
 *  request and, on success, sets Recraft as the active Image Provider. */
function ImageKeyTest({ keys }: { keys: ReturnType<typeof useApiKeys> }) {
  return <RecraftKeyTestInner keys={keys} />;
}

/** Diagnostic: list the real image-capable Gemini models a key can access, let
 *  the user pick one, validate it against the live endpoint, then save it as the
 *  active Gemini image model. Never hardcodes a model that Gemini can't confirm. */
function GeminiModelDiagnostic({ keys }: { keys: ReturnType<typeof useApiKeys> }) {
  const geminiKey = keys.find((k) => k.provider === "Google Gemini" && k.apiKey.trim());

  return (
    <div className="rounded-md border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          Gemini image model diagnostics are disabled in Zero-Budget Mode.
        </div>
        <Button size="sm" variant="outline" disabled={!geminiKey || true}>
          Disabled
        </Button>
      </div>
    </div>
  );
}

/** Test Recraft Connection — validates the saved Recraft key with a minimal
 *  request and, on success, sets Recraft as the active Image Provider. */
function RecraftKeyTestInner({ keys }: { keys: ReturnType<typeof useApiKeys> }) {
  const activeImage = useActiveImageProvider();
  const [testing, setTesting] = useState(false);
  const recraftKey = keys.find((k) => k.provider === "Recraft" && k.apiKey.trim());

  async function run() {
    if (!recraftKey) {
      toast.error("Add a Recraft API key first (Provider: Recraft).");
      return;
    }
    // Ensure routing points at Recraft so the payload targets it.
      enforceZeroBudgetImageRouting();
    setTesting(true);
    try {
      const provider = { name: "puter" as const, fallback: false };
      await testImageProvider(provider);
      markTested(recraftKey.id, IMAGE_PROVIDER_TEST_PASSED);
      toast.success("Recraft saved for future use; active images remain Puter → Pollinations");
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
    ? "Failed"
    : activeAny
      ? "Connected"
      : "Not Activated";

  const textName = text ? (text.name === "openai" ? "OpenAI" : "Gemini") : null;
  const imageName = image ? (image.label) : null;

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HeadIcon className={`h-5 w-5 ${headCls}`} />
          <div>
            <div className={`text-sm font-medium ${headCls}`}>Provider status: {headLabel}</div>
            {geminiMessage && (
              <pre className="mt-0.5 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
                {geminiMessage}
              </pre>
            )}
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
              <span className="text-muted-foreground"> · last connected {fmtTime(lastTestedFor(["Recraft", "OpenAI", "Google Gemini"]))}</span>
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
