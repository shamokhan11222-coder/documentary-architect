// API Settings: legacy Gemini image keys are visible only as disabled future
// provider state. They are never used by the image-generation runtime.
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGeminiImageKeys,
  removeGeminiImageKey,
} from "@/lib/gemini-image-keys";

function maskKey(key: string) {
  const k = key.trim();
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export function GeminiImageKeys() {
  const keys = useGeminiImageKeys();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" />
        <div className="text-sm font-medium">Gemini Image Keys (disabled future provider)</div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Gemini image generation is disabled in Zero-Budget Mode. Storyboard images and thumbnails use Puter AI with
        Pollinations fallback only.
      </p>

      <div className="mt-3 space-y-2">
        {keys.length === 0 && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            No legacy Gemini image keys saved.
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
                Disabled in Zero-Budget Mode · fails: {k.failCount} ·{" "}
                {k.lastUsed ? `last used ${new Date(k.lastUsed).toLocaleTimeString()}` : "never used"}
                {k.disabledReason ? ` · ${k.disabledReason}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => removeGeminiImageKey(k.id)}>
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
