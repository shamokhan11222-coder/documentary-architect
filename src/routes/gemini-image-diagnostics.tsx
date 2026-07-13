import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/gemini-image-diagnostics")({
  head: () => ({ meta: [{ title: "Gemini Image Disabled — Stickmax Studio" }] }),
  component: GeminiImageDiagnosticsPage,
});

function GeminiImageDiagnosticsPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Gemini Image Diagnostics</h1>
      <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm">
        <div className="font-medium">Disabled in Zero-Budget Mode</div>
        <p className="mt-2 text-muted-foreground">
          Storyboard images and thumbnails now use Puter AI as the primary provider with Pollinations fallback. This page
          no longer sends Gemini image diagnostics or generation requests.
        </p>
        <div className="mt-4 grid gap-1 font-mono text-xs text-muted-foreground">
          <div>active provider: Puter AI</div>
          <div>fallback provider: Pollinations</div>
          <div>Gemini image requests: blocked before network</div>
        </div>
      </div>
    </div>
  );
}