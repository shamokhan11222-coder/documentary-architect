// Client → server bridge for Lovable AI Gateway image generation.
// Never talks directly to the gateway; always goes through /api/generate-image
// so LOVABLE_API_KEY stays server-side.
import { readLocal, writeLocal, useLocal } from "./local";

export type LovableGatewayStatus = "idle" | "ready" | "generating" | "rate-limited" | "no-credits" | "unavailable" | "failed";

const STATUS_KEY = "docos.image.lovableGateway.status";
const MODEL_KEY = "docos.image.lovableGateway.model";

export const LOVABLE_GATEWAY_MODELS = {
  economy: "google/gemini-3.1-flash-lite-image",
  balanced: "google/gemini-3.1-flash-image",
  highest: "google/gemini-3-pro-image",
} as const;

export type LovableGatewayTier = keyof typeof LOVABLE_GATEWAY_MODELS;

export function getLovableGatewayModel(): string {
  return readLocal<string>(MODEL_KEY, LOVABLE_GATEWAY_MODELS.balanced);
}
export function setLovableGatewayModel(m: string) {
  writeLocal(MODEL_KEY, m);
}
export function useLovableGatewayModel(): string {
  return useLocal<string>(MODEL_KEY, LOVABLE_GATEWAY_MODELS.balanced);
}

export function getLovableGatewayStatus(): LovableGatewayStatus {
  return readLocal<LovableGatewayStatus>(STATUS_KEY, "idle");
}
export function useLovableGatewayStatus(): LovableGatewayStatus {
  return useLocal<LovableGatewayStatus>(STATUS_KEY, "idle");
}
export function setLovableGatewayStatus(s: LovableGatewayStatus) {
  writeLocal<LovableGatewayStatus>(STATUS_KEY, s);
}

export class LovableGatewayError extends Error {
  code: string;
  status: number;
  model: string;
  constructor(message: string, code: string, status: number, model: string) {
    super(message);
    this.name = "LovableGatewayError";
    this.code = code;
    this.status = status;
    this.model = model;
  }
}

export interface LovableGatewayResult {
  image: string;
  model: string;
  ms: number;
}

export interface LovableGatewayOptions {
  width?: number;
  height?: number;
  purpose?: "storyboard" | "thumbnail" | "test";
  model?: string;
  references?: string[];
}

export async function lovableGatewayGenerateImage(
  prompt: string,
  opts: LovableGatewayOptions = {},
): Promise<LovableGatewayResult> {
  setLovableGatewayStatus("generating");
  const model = opts.model ?? getLovableGatewayModel();
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      width: opts.width ?? 1280,
      height: opts.height ?? 720,
      purpose: opts.purpose ?? "storyboard",
      references: opts.references,
    }),
  });

  if (!res.ok) {
    let payload: { error?: string; code?: string; status?: number; model?: string } = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    const code = payload.code ?? "PROVIDER_ERROR";
    if (res.status === 429) setLovableGatewayStatus("rate-limited");
    else if (res.status === 402 || code === "PAYMENT_REQUIRED") setLovableGatewayStatus("no-credits");
    else setLovableGatewayStatus("failed");
    throw new LovableGatewayError(payload.error ?? `gateway ${res.status}`, code, res.status, payload.model ?? model);
  }
  const json = (await res.json()) as LovableGatewayResult;
  setLovableGatewayStatus("ready");
  return json;
}