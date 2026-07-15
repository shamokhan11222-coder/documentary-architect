// Voice generation is now 100% local (kokoro-js in the browser). This route
// exists only as a compatibility stub so any stale client call returns a
// clean error instead of hitting Lovable AI Gateway or Gemini.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({
            error:
              "Server voice generation is disabled. Voice runs locally in the browser (Local TTS — Free).",
          }),
          { status: 410, headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});
