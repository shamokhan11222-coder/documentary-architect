import { createFileRoute } from "@tanstack/react-router";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "qwen/qwen3-32b:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
] as const;

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
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) return new Response("Missing OPENROUTER_API_KEY", { status: 500 });

        const sys = context ? `${SYSTEM}\n\nCURRENT PROJECT CONTEXT:\n${context.slice(0, 6000)}` : SYSTEM;

        let lastStatus = 0;
        let lastText = "";
        for (const model of OPENROUTER_MODELS) {
          const res = await fetch(OPENROUTER_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://stickmax.studio",
              "X-Title": "Stickmax Studio",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "system", content: sys }, ...messages.slice(-20)],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const reply = data?.choices?.[0]?.message?.content ?? "Hmm, I didn't catch that.";
            return Response.json({ reply });
          }
          lastStatus = res.status;
          lastText = await res.text().catch(() => "");
          // Only stop on non-retryable errors
          if (res.status !== 429 && res.status !== 402 && res.status < 500 && res.status !== 404 && res.status !== 400) break;
        }
        const msg =
          lastStatus === 429
            ? "All free models are rate limited — try again in a bit 🙏"
            : `Chat failed (${lastStatus}): ${lastText.slice(0, 160)}`;
        return Response.json({ reply: msg }, { status: 200 });
      },
    },
  },
});