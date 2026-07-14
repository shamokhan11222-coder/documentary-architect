// Lovable AI Gateway image generation route.
// Server-side only. LOVABLE_API_KEY is read inside the handler and never
// leaves the server. Pixels flow: client → this route → Lovable Gateway
// (/v1/images/generations) → data URL response.
import { createFileRoute } from "@tanstack/react-router";

type Purpose = "storyboard" | "thumbnail" | "test";

interface RequestBody {
  prompt?: string;
  width?: number;
  height?: number;
  purpose?: Purpose;
  model?: string;
  /** Optional image URLs / data URLs to send as reference conditioning. */
  references?: string[];
}

// Recognised image-capable Gateway models. First entry is the default.
const KNOWN_MODELS = [
  "google/gemini-3.1-flash-image",
  "google/gemini-3.1-flash-lite-image",
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image",
  "openai/gpt-image-1-mini",
  "openai/gpt-image-2",
] as const;

const DEFAULT_MODEL = KNOWN_MODELS[0];

function jsonError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, status, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Best-effort data-URL extractor for either streaming or non-streaming
 *  Lovable Gateway image responses. */
function extractImageDataUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const seen = new Set<unknown>();
  const stack: unknown[] = [payload];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v);
      continue;
    }
    const obj = node as Record<string, unknown>;
    // OpenAI images/generations: { data: [{ b64_json }] }
    if (typeof obj.b64_json === "string") return `data:image/png;base64,${obj.b64_json}`;
    // Chat-completions image parts: { image_url: { url: "data:..." } } or { url: "data:..." }
    if (obj.image_url && typeof obj.image_url === "object") {
      const u = (obj.image_url as Record<string, unknown>).url;
      if (typeof u === "string" && u.startsWith("data:image")) return u;
    }
    if (typeof obj.url === "string" && obj.url.startsWith("data:image")) return obj.url;
    if (typeof obj.image === "string" && obj.image.startsWith("data:image")) return obj.image;
    for (const v of Object.values(obj)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}

/** Aggregate an SSE stream body and concatenate every JSON delta into one
 *  object so extractImageDataUrl can find the final image. */
async function aggregateSse(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events: unknown[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try { events.push(JSON.parse(data)); } catch { /* ignore malformed */ }
      }
    }
  }
  return events;
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const started = Date.now();
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return jsonError("LOVABLE_API_KEY is not configured on the server.", 500, { code: "NO_KEY" });

        let body: RequestBody;
        try { body = (await request.json()) as RequestBody; }
        catch { return jsonError("Invalid JSON body.", 400, { code: "BAD_JSON" }); }

        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return jsonError("Missing prompt.", 400, { code: "BAD_REQUEST" });

        const model = body.model && KNOWN_MODELS.includes(body.model as typeof KNOWN_MODELS[number])
          ? body.model
          : DEFAULT_MODEL;

        // Build user content — prompt + optional reference images.
        // Hard cap at 2 references (matches Credit Saver Mode client cap).
        const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
        if (Array.isArray(body.references)) {
          for (const ref of body.references.slice(0, 2)) {
            if (typeof ref === "string" && (ref.startsWith("data:image") || ref.startsWith("https://") || ref.startsWith("http://"))) {
              userContent.push({ type: "image_url", image_url: { url: ref } });
            }
          }
        }

        const gatewayBody = {
          model,
          messages: [{ role: "user", content: userContent }],
          modalities: ["image", "text"],
          stream: true,
        };

        let upstream: Response;
        try {
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(gatewayBody),
          });
        } catch (e) {
          return jsonError(`Gateway request failed: ${e instanceof Error ? e.message : String(e)}`, 502, { code: "NETWORK", model });
        }

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          const code = upstream.status === 402 ? "PAYMENT_REQUIRED" : upstream.status === 429 ? "RATE_LIMIT" : "PROVIDER_ERROR";
          return jsonError(`gateway ${upstream.status}: ${text || upstream.statusText}`, upstream.status, { code, model });
        }

        // Try streaming aggregation first; if the response isn't SSE fall back to JSON.
        const contentType = upstream.headers.get("content-type") || "";
        let dataUrl: string | null = null;
        let rawSummary = "";
        if (contentType.includes("text/event-stream") && upstream.body) {
          const events = await aggregateSse(upstream.body);
          for (let i = events.length - 1; i >= 0 && !dataUrl; i--) dataUrl = extractImageDataUrl(events[i]);
          rawSummary = `sse events: ${events.length}`;
        } else {
          const text = await upstream.text();
          try {
            const parsed = JSON.parse(text);
            dataUrl = extractImageDataUrl(parsed);
            rawSummary = "json";
          } catch {
            rawSummary = text.slice(0, 200);
          }
        }

        if (!dataUrl) {
          return jsonError(`Gateway returned no image (${rawSummary}).`, 502, { code: "NO_IMAGE", model });
        }

        return Response.json({
          image: dataUrl,
          provider: "lovable-gateway",
          model,
          purpose: body.purpose ?? "storyboard",
          ms: Date.now() - started,
        });
      },
    },
  },
});