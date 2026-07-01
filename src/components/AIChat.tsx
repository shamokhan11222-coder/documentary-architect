import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

import { useSelectedTopicId, useTopics, useResearch, useStory } from "@/lib/store";
import { getInstructionText } from "@/lib/instructions";
import { Button } from "@/components/ui/button";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export function AIChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hey! 🎬 I'm your AI producer. Ask me anything — rewrite a part, punch up a scene, sharpen the hook, or just brainstorm. What are we working on?" },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  const selectedId = useSelectedTopicId();
  const topics = useTopics();
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const research = useResearch(selectedId);
  const story = useStory(selectedId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  function buildContext(): string {
    const parts: string[] = [];
    if (selected) parts.push(`Project: ${selected.topic}\nAngle: ${selected.explanation}`);
    if (research) parts.push(`Main conflict: ${research.mainConflict}\nBest angle: ${research.bestAngle}`);
    if (story) parts.push(`Story sections: ${story.sections.map((s) => s.title).join(", ")}\nScript excerpt:\n${story.script.slice(0, 2500)}`);
    const instr = getInstructionText();
    if (instr) parts.push(`Standing art/story instructions: ${instr}`);
    return parts.join("\n\n");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: buildContext() }),
      });
      const data = (await res.json()) as { reply: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong reaching the AI. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Open AI assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-semibold">AI Producer 🎬</div>
        <button onClick={() => setOpen(false)} aria-label="Close">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-accent text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message your AI producer…"
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button size="icon" className="h-9 w-9" onClick={send} disabled={busy}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}