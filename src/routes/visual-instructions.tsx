import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";

import {
  useVisualInstructions,
  setVisualInstructions,
  resetVisualInstructions,
  DEFAULT_VISUAL_INSTRUCTIONS,
} from "@/lib/visual-instructions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/visual-instructions")({
  head: () => ({ meta: [{ title: "Visual Instructions — Documentary Studio" }] }),
  component: VisualInstructionsPage,
});

function VisualInstructionsPage() {
  const saved = useVisualInstructions();
  const [text, setText] = useState(saved);

  useEffect(() => {
    setText(saved);
  }, [saved]);

  const dirty = text !== saved;
  const isDefault = saved === DEFAULT_VISUAL_INSTRUCTIONS;

  function save() {
    setVisualInstructions(text);
    toast.success("Visual instructions saved");
  }

  function reset() {
    resetVisualInstructions();
    setText(DEFAULT_VISUAL_INSTRUCTIONS);
    toast.success("Restored default visual style");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold">Visual Instructions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanent art direction applied to every storyboard and image across all
        projects. The default is the simple MS Paint documentary style — edit it
        only if you want to change the studio's core look.
      </p>

      <div className="mt-5 space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[24rem] font-mono text-sm leading-relaxed"
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!dirty}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
          <Button variant="outline" onClick={reset} disabled={isDefault && !dirty}>
            <RotateCcw className="mr-2 h-4 w-4" /> Restore default
          </Button>
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : isDefault ? "Using default style" : "Custom style active"}
          </span>
        </div>
      </div>
    </div>
  );
}
