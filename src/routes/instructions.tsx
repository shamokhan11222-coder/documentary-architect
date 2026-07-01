import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, Plus } from "lucide-react";

import { useInstructions, addInstruction, removeInstruction } from "@/lib/instructions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/instructions")({
  head: () => ({ meta: [{ title: "AI Instructions — Documentary Studio" }] }),
  component: InstructionsPage,
});

const EXAMPLES = [
  "Make visuals more emotional.",
  "Keep backgrounds empty.",
  "Use more close-up shots.",
  "Never use grey backgrounds.",
  "Show fewer characters.",
  "Make scenes more minimal.",
  "Use stronger facial expressions.",
  "Use arrows for explanations.",
];

function InstructionsPage() {
  const instructions = useInstructions();
  const [text, setText] = useState("");

  function add() {
    if (!text.trim()) return;
    addInstruction(text);
    setText("");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold">AI Instructions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell the AI how you want your documentaries made. These are remembered across every project
        and applied silently to every image and script generation.
      </p>

      <div className="mt-5 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Make visuals more emotional. Keep backgrounds empty."
          className="min-h-20"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText((t) => (t ? t + " " + ex : ex))}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button onClick={add} disabled={!text.trim()}>
          <Plus className="mr-2 h-4 w-4" /> Add instruction
        </Button>
      </div>

      <div className="mt-6 space-y-2">
        {instructions.length === 0 && (
          <p className="text-sm text-muted-foreground">No standing instructions yet.</p>
        )}
        {instructions.map((i) => (
          <div key={i.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <p className="text-sm">{i.text}</p>
            <Button size="icon" variant="ghost" onClick={() => removeInstruction(i.id)} aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}