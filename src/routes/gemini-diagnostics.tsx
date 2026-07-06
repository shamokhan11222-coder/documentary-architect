import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApiKeys, saveApiKey } from "@/lib/apikeys";
import {
  useActiveTextProvider,
  useActiveImageProvider,
  GEMINI_TEXT_MODEL_DEFAULT,
  GEMINI_IMAGE_MODEL_DEFAULT,
  saveProviderSettings,
} from "@/lib/provider";
import { normalizeGeminiModel } from "@/lib/gemini-model";
import {
  geminiDiagnostics,
  listGeminiModels,
  type GeminiDiagnostics,
  type GeminiModelList,
} from "@/lib/generate-image";

export const Route = createFileRoute("/gemini-diagnostics")({
  head: () => ({ meta: [{ title: "Gemini Diagnostics — Stickmax Studio" }] }),
  component: GeminiDiagnosticsPage,
});

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/50 py-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-56 shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function GeminiDiagnosticsPage() {
  const keys = useApiKeys();
  const textProvider = useActiveTextProvider();
  const imageProvider = useActiveImageProvider();

  const geminiKey = keys.find((k) => k.provider === "Google Gemini" && k.apiKey.trim()) ?? null;
  const apiKey = geminiKey?.apiKey.trim() ?? "";
  const keyMasked = apiKey
    ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)} (${apiKey.length} chars)`
    : "None detected";

  const textModel =
    textProvider?.name === "gemini" ? textProvider.textModel : GEMINI_TEXT_MODEL_DEFAULT;
  const imageModel =
    imageProvider?.name === "gemini" ? imageProvider.imageModel : GEMINI_IMAGE_MODEL_DEFAULT;

  const [diag, setDiag] = useState<GeminiDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const [models, setModels] = useState<GeminiModelList | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  async function runDiagnostics() {
    if (!apiKey) {
      toast.error("No Gemini API key detected. Add one in API Settings.");
      return;
    }
    setDiagLoading(true);
    try {
      const res = await geminiDiagnostics(apiKey, imageModel);
      setDiag(res);
      if (res.ok) toast.success(`Gemini reachable (HTTP ${res.httpStatus})`);
      else toast.error(res.error || `Gemini returned HTTP ${res.httpStatus ?? "error"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnostics failed");
    } finally {
      setDiagLoading(false);
    }
  }

  async function fetchModels() {
    if (!apiKey) {
      toast.error("No Gemini API key detected. Add one in API Settings.");
      return;
    }
    setModelsLoading(true);
    try {
      const res = await listGeminiModels(apiKey);
      setModels(res);
      toast.success(`Found ${res.allModels.length} models (${res.imageModels.length} image-capable)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not list Gemini models");
    } finally {
      setModelsLoading(false);
    }
  }

  function selectImageModel(id: string) {
    if (!geminiKey) return;
    // Persist the picked IMAGE model separately from the text model, then route
    // image + thumbnail to Gemini. Never validated using text-model logic.
    const model = normalizeGeminiModel(id) || GEMINI_IMAGE_MODEL_DEFAULT;
    saveApiKey({ ...geminiKey, imageModelName: model });
    saveProviderSettings({ image: "gemini", thumbnail: "gemini" });
    toast.success(`Final Gemini model sent: ${model}`);
  }

  const currentImageModel = imageModel;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Gemini Diagnostics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Read-only connection inspector. No content is generated on this page.
      </p>

      {/* Configuration snapshot */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-lg font-medium">Configuration</h2>
        <div className="divide-y divide-border/50">
          <Row label="Gemini SDK version" value="None — direct REST (fetch), no SDK" />
          <Row label="API endpoint" value="https://generativelanguage.googleapis.com" mono />
          <Row label="API version" value="v1beta" mono />
          <Row label="Authentication method" value="API-key auth only: x-goog-api-key header, then ?key fallback; no Bearer token for API keys" />
          <Row
            label="Active API key detected"
            value={
              <span className="inline-flex items-center gap-2">
                {apiKey ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-mono">{keyMasked}</span>
              </span>
            }
          />
          <Row label="Text model" value={textModel} mono />
          <Row label="Image model" value={currentImageModel} mono />
        </div>
      </section>

      {/* Live diagnostics */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Live request</h2>
          <Button onClick={runDiagnostics} disabled={diagLoading || !apiKey}>
            {diagLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run diagnostics
          </Button>
        </div>
        {diag && (
          <div className="mt-4 divide-y divide-border/50">
            <Row label="Full request URL" value={diag.requestUrl ?? "—"} mono />
            <Row label="Endpoint URL" value={diag.endpoint ?? "—"} mono />
            <Row label="API version used" value={diag.apiVersion ?? "—"} mono />
            <Row label="Model name" value={diag.model ?? diag.imageModel ?? "—"} mono />
            <Row label="Authentication method" value={diag.authMethod ?? "—"} />
            <Row label="Authentication header name" value={diag.authHeaderName ?? "—"} mono />
            <Row label="Bearer token used" value={diag.usesBearer ? "yes" : "no"} mono />
            <Row label="Query parameter usage" value={diag.queryParameterUsage ?? "—"} />
            <Row label="HTTP method" value={diag.requestMethod ?? "—"} mono />
            <Row
              label="HTTP status code"
              value={
                <span className="inline-flex items-center gap-2">
                  {diag.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="font-mono">
                    {diag.httpStatus ?? "—"} {diag.statusText ?? ""}
                  </span>
                  {typeof diag.ms === "number" && (
                    <span className="text-muted-foreground">({diag.ms} ms)</span>
                  )}
                </span>
              }
            />
            <div className="py-2">
              <span className="text-sm font-medium text-muted-foreground">Full HTTP request</span>
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {diag.fullRequest || "—"}
              </pre>
            </div>
            <div className="py-2">
              <span className="text-sm font-medium text-muted-foreground">Full HTTP response</span>
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {diag.fullResponse || diag.error || "—"}
              </pre>
            </div>
            <div className="py-2">
              <span className="text-sm font-medium text-muted-foreground">Raw response body</span>
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {diag.responseBody || diag.error || "(empty)"}
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* Model list */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">List Available Gemini Models</h2>
          <Button variant="outline" onClick={fetchModels} disabled={modelsLoading || !apiKey}>
            {modelsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            List models
          </Button>
        </div>

        {models && (
          <div className="mt-4 space-y-4">
            <div className="text-xs text-muted-foreground">
              Endpoint: <span className="font-mono">{models.endpoint}</span> · API version:{" "}
              <span className="font-mono">{models.apiVersion}</span>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4" /> Image-capable models ({models.imageModels.length})
              </h3>
              {models.imageModels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No image-capable models returned for this key.
                </p>
              ) : (
                <ul className="space-y-2">
                  {models.imageModels.map((m) => {
                    const selected = m.id === currentImageModel;
                    return (
                      <li
                        key={m.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                      >
                        <div>
                          <div className="font-mono text-sm">{m.id}</div>
                          <div className="text-xs text-muted-foreground">{m.displayName}</div>
                        </div>
                        <Button
                          size="sm"
                          variant={selected ? "secondary" : "default"}
                          onClick={() => selectImageModel(m.id)}
                          disabled={selected}
                        >
                          {selected ? "Selected" : "Use this model"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">All models ({models.allModels.length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {models.allModels.map((id) => (
                  <span key={id} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
