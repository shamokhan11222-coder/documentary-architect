// Floating Developer Debug panel. Shows the EXACT last provider/AI error —
// provider, model, endpoint, HTTP status, response time, request id and the
// raw response body — with a "Copy Error Details" button. Nothing is hidden.
import { useState } from "react";
import { Bug, X, Copy, Check } from "lucide-react";
import { useErrorDetails, clearErrorDetails } from "@/lib/error-details";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 py-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-foreground">{value ?? "—"}</span>
    </div>
  );
}

export function DebugPanel() {
  const details = useErrorDetails();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!details) return null;

  const unavailable = !details.hadResponse;

  const headersText = details.responseHeaders
    ? Object.entries(details.responseHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    : "";
  const rawJsonText =
    details.rawJson != null ? JSON.stringify(details.rawJson, null, 2) : "";

  const copyText = [
    `Provider: ${details.provider ?? "—"}`,
    `Model: ${details.model ?? "—"}`,
    `Endpoint: ${details.endpoint ?? "—"}`,
    `HTTP Method: ${details.httpMethod ?? "—"}`,
    `HTTP Status: ${details.httpStatus ?? "—"}`,
    `Response Time: ${details.responseTimeMs != null ? details.responseTimeMs + "ms" : "—"}`,
    `Request ID: ${details.requestId ?? "—"}`,
    `Retry After: ${details.retryAfter ?? "—"}`,
    `Error Code: ${details.code ?? "—"}`,
    `Error Type: ${details.errorType ?? "—"}`,
    `Exact Error: ${details.message}`,
    ``,
    `Response Headers:`,
    headersText || "—",
    ``,
    `Raw JSON Response:`,
    rawJsonText || "—",
    ``,
    `Raw Response Body:`,
    details.rawBody ?? details.message ?? "",
    ``,
    `Stack Trace:`,
    details.stack ?? "—",
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[60] max-w-[min(92vw,460px)]">
      {open ? (
        <div className="rounded-lg border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bug className="h-4 w-4 text-destructive" />
              Developer Debug
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy Debug Report"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Collapse debug panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-auto px-3 py-2">
            {unavailable && (
              <p className="mb-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                No response received from any provider.
              </p>
            )}
            <Row label="Provider" value={details.provider} />
            <Row label="Model" value={details.model} />
            <Row label="Endpoint" value={details.endpoint} />
            <Row label="HTTP Method" value={details.httpMethod} />
            <Row label="HTTP Status" value={details.httpStatus} />
            <Row
              label="Response Time"
              value={details.responseTimeMs != null ? `${details.responseTimeMs}ms` : "—"}
            />
            <Row label="Request ID" value={details.requestId} />
            <Row label="Retry After" value={details.retryAfter} />
            <Row label="Error Code" value={details.code} />
            <Row label="Error Type" value={details.errorType} />
            <Row label="Provider Error" value={details.message} />
            {headersText && (
              <div className="mt-2">
                <span className="text-xs font-medium text-muted-foreground">Response Headers</span>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] text-foreground">
                  {headersText}
                </pre>
              </div>
            )}
            {rawJsonText && (
              <div className="mt-2">
                <span className="text-xs font-medium text-muted-foreground">Raw JSON Response</span>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] text-foreground">
                  {rawJsonText}
                </pre>
              </div>
            )}
            <div className="mt-2">
              <span className="text-xs font-medium text-muted-foreground">Raw Response Body</span>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] text-foreground">
                {details.rawBody || details.message || "(empty)"}
              </pre>
            </div>
            {details.stack && (
              <div className="mt-2">
                <span className="text-xs font-medium text-muted-foreground">Stack Trace</span>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px] text-foreground">
                  {details.stack}
                </pre>
              </div>
            )}
            <button
              onClick={clearErrorDetails}
              className="mt-3 w-full rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-background px-3 py-2 text-xs font-medium text-destructive shadow-lg hover:bg-destructive/10"
        >
          <Bug className="h-4 w-4" />
          Last error
        </button>
      )}
    </div>
  );
}
