// Client → server bridge for Lovable AI Gateway image generation.
// Never talks directly to the gateway; always goes through /api/generate-image
// so LOVABLE_API_KEY stays server-side.
import { readLocal, writeLocal, useLocal } from "./local";
import {
  activeGatewayModel,
  targetDimensions,
  referenceCap,
  NO_GATEWAY_CREDITS_MESSAGE,
} from "./credit-saver";

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
  // Legacy manual override — Credit Saver's active tier wins by default.
  return readLocal<string>(MODEL_KEY, activeGatewayModel());
}
export function setLovableGatewayModel(m: string) {
  writeLocal(MODEL_KEY, m);
}
export function useLovableGatewayModel(): string {
  return useLocal<string>(MODEL_KEY, activeGatewayModel());
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
  // Credit Saver's tier is authoritative unless the caller pins a model.
  const model = opts.model ?? activeGatewayModel();
  const purpose = opts.purpose ?? "storyboard";
  const dims = targetDimensions(purpose);
  const width = opts.width ?? dims.width;
  const height = opts.height ?? dims.height;
  const cappedRefs = Array.isArray(opts.references)
    ? opts.references.slice(0, referenceCap())
    : undefined;
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      width,
      height,
      purpose,
      references: cappedRefs,
    }),
  });

  if (!res.ok) {
    let payload: { error?: string; code?: string; status?: number; model?: string } = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    const code = payload.code ?? "PROVIDER_ERROR";
    if (res.status === 429) setLovableGatewayStatus("rate-limited");
    else if (res.status === 402 || code === "PAYMENT_REQUIRED") setLovableGatewayStatus("no-credits");
    else setLovableGatewayStatus("failed");
    // Show the friendly credits-empty message instead of the raw provider text.
    const msg = res.status === 402 || code === "PAYMENT_REQUIRED"
      ? NO_GATEWAY_CREDITS_MESSAGE
      : payload.error ?? `gateway ${res.status}`;
    throw new LovableGatewayError(msg, code, res.status, payload.model ?? model);
  }
  const json = (await res.json()) as LovableGatewayResult;
  setLovableGatewayStatus("ready");
  return json;
}