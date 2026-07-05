import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PlayCircle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApiKeys } from "@/lib/apikeys";
import { useActiveImageProvider, GEMINI_IMAGE_MODEL_DEFAULT } from "@/lib/provider";
import {
  geminiImageDiagnostics,
  type ImageDiagnostics,
  type ImageDiagCheck,
  type ImageDiagRaw,
} from "@/lib/generate-image";

export const Route = createFileRoute("/gemini-image-diagnostics")({
  head: () => ({
    meta: [
      { title: "Gemini Image Diagnostics — Stickmax Studio" },
      {
        name: "description",
        content:
          "Run PASS/FAIL checks against the Gemini image provider without generating an image. See the exact Google request and response.",
      },
    ],
  }),
  component: GeminiImageDiagnosticsPage,
});

function StatusIcon({ status }: { status: ImageDiagCheck["status"] }) {
  if (status === "PASS") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "FAIL") return <XCircle className="h-5 w-5 text-destructive" />;
  return <HelpCircle className="h-5 w-5 text-yellow-500" />;
}

function StatusBadge({ status }: { status: ImageDiagCheck["status"] }) {
  const cls =
    status === "PASS"
      ? "bg-green-500/15 text-green-600"
      : status === "FAIL"
        ? "bg-destructive/15 text-destructive"
        : "bg-yellow-500/15 text-yellow-600";
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}

function RawSection({ title, raw }: { title: string; raw: ImageDiagRaw }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-3 text-xs">
        <Field label="Request URL" value={raw.requestUrl} />
        <Field label="Request Headers (API key hidden)" value={JSON.stringify(raw.requestHeaders, null, 2)} />
        <Field label="Request Body" value={raw.requestBody} />
        <Field label="Response Code" value={String(raw.responseCode || "—")} />
        <Field
          label="Response Headers"
          value={
            raw.responseHeaders && Object.keys(raw.responseHeaders).length
              ? JSON.stringify(raw.responseHeaders, null, 2)
              : "(none)"
          }
        />
        <div>
          <div className="mb-1 font-medium text-muted-foreground">Response Body (exact, verbatim)</div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono">
            {raw.responseBody || "(empty)"}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 font-medium text-muted-foreground">{label}</div>
      <pre className="overflow-auto rounded-lg bg-muted p-2 font-mono break-all whitespace-pre-wrap">{value}</pre>
    </div>
  );
}

function GeminiImageDiagnosticsPage() {
  const keys = useApiKeys();
  const imageProvider = useActiveImageProvider();

  const geminiKey = keys.find((k) => k.provider === "Google Gemini" && k.apiKey.trim()) ?? null;
  const apiKey = geminiKey?.apiKey.trim() ?? "";
  const keyMasked = apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)} (${apiKey.length} chars)` : "None detected";
  const imageModel =
    imageProvider?.name === "gemini" ? imageProvider.imageModel : geminiKey?.imageModelName?.trim() || GEMINI_IMAGE_MODEL_DEFAULT;

  const [result, setResult] = useState<ImageDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    if (!apiKey) {
      toast.error("No Gemini API key detected. Add one in API Settings.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await geminiImageDiagnostics(apiKey, imageModel);
      setResult(res);
      const failed = res.checks.filter((c) => c.status === "FAIL").length;
      if (failed === 0) toast.success("All checks passed.");
      else toast.error(`${failed} check(s) failed — see details below.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnostics failed");
    } finally {
      setLoading(false);
    }
  }

  const checks = result ? [...result.checks].sort((a, b) => a.id - b.id) : [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Gemini Image Diagnostics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Runs a full set of PASS/FAIL checks against the Gemini image provider. No image is generated — only lightweight
        read requests are sent, and the exact Google response is shown verbatim.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div>
              <span className="text-muted-foreground">API key: </span>
              <span className="font-mono">{keyMasked}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Image model: </span>
              <span className="font-mono">{imageModel}</span>
            </div>
          </div>
          <Button onClick={runTest} disabled={loading || !apiKey}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            Test Image Provider
          </Button>
        </div>
      </section>

      {checks.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-medium">Checks</h2>
          <ul className="divide-y divide-border/50">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-3">
                <StatusIcon status={c.status} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {c.id}. {c.label}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground break-words">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-medium">Raw request &amp; response (exact)</h2>
          <div className="rounded-xl border border-border bg-card p-4 text-xs">
            <Field label="Authentication method used" value={result.authMethod ?? "x-goog-api-key (API key)"} />
            <Field label="Authentication header name" value={result.authHeaderName ?? "x-goog-api-key"} />
            <Field label="Bearer token used" value={result.usesBearer ? "yes" : "no"} />
            <Field label="Query parameter usage" value={result.queryParameterUsage ?? "none"} />
          </div>
          <RawSection title="Models list request" raw={result.modelsList} />
          <RawSection title={`Model lookup request (${result.model})`} raw={result.modelLookup} />
          <RawSection title="Official image generation request" raw={result.generationRequest} />
        </section>
      )}
    </div>
  );
}