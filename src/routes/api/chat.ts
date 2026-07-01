import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

type Msg = { role: "user" | "assistant" | "system"; content: string };
type Body = { messages?: Msg[]; context?: string };

const SYSTEM = `You are the AI producer inside a private Documentary Production Operating System.
You talk like a friendly, sharp creative partner — natural, warm, a few emojis 🎬✨, never robotic.
You help with topics, research, story, storyboard, images, thumbnails, SEO, pacing, and decisions.
You understand natural requests like "rewrite Part 3", "make Scene 24 more emotional", "stronger hook",
"why this thumbnail", "shorten the script". When asked to change something, explain concretely what you'd
change and tell the user which module button to press to apply it (e.g. "hit Regenerate on Scene 17").
Be concise but human.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, context } = (await request.json()) as Body;
        if (!Array.isArray(messages)) return new Response("Missing messages", { status: 400 });
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const sys = context ? `${SYSTEM}\n\nCURRENT PROJECT CONTEXT:\n${context.slice(0, 6000)}` : SYSTEM;

        const res = await fetch(GATEWAY, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "system", content: sys }, ...messages.slice(-20)],
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const status = res.status;
          const msg =
            status === 429
              ? "I'm being rate limited — give me a sec and try again 🙏"
              : status === 402
                ? "Out of AI credits — top up in workspace settings."
                : `Chat failed (${status}): ${text.slice(0, 160)}`;
          return Response.json({ reply: msg }, { status: 200 });
        }
        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content ?? "Hmm, I didn't catch that.";
        return Response.json({ reply });
      },
    },
  },
});