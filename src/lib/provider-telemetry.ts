// Lightweight provider telemetry for the API Settings debug panel. Records the
// provider used for the last AI request, whether it succeeded, and the real
// error message (if any). Written by the client middleware in src/start.ts.
import { readLocal, writeLocal, useLocal } from "./local";

const KEY = "docos.provider.telemetry";

export interface ProviderTelemetry {
  lastProvider: "gemini" | "openai" | "fal" | "replicate" | "recraft" | "puter" | "huggingface" | "pollinations" | "builtin" | null;
  lastStatus: "success" | "error" | null;
  lastError: string | null;
  at: number | null;
}

const EMPTY: ProviderTelemetry = {
  lastProvider: null,
  lastStatus: null,
  lastError: null,
  at: null,
};

export function recordTelemetry(patch: Partial<ProviderTelemetry>) {
  writeLocal<ProviderTelemetry>(KEY, {
    ...readLocal<ProviderTelemetry>(KEY, EMPTY),
    ...patch,
    at: Date.now(),
  });
}

export function useTelemetry(): ProviderTelemetry {
  return useLocal<ProviderTelemetry>(KEY, EMPTY);
}
