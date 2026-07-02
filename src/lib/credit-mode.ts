// Credit Saver Mode — a global setting that tunes how aggressively DOCU OS
// spends AI credits. It never rebuilds finished work; it only shapes how much
// new generation happens per action (batch sizes, reference count, how many
// thumbnails are made up-front). Stored locally so it follows the browser.
import { readLocal, writeLocal, useLocal } from "./local";

export type CreditMode = "ultra" | "balanced" | "best";

const KEY = "docos.creditMode";

export interface CreditModeConfig {
  id: CreditMode;
  label: string;
  description: string;
  /** Reference images fed to the image model (fewer = cheaper/faster). */
  dnaReferences: number;
  /** Default "Generate Next N" batch size for storyboard images. */
  defaultImageBatch: number;
  /** How many thumbnails to create on the first click. */
  initialThumbnails: number;
}

export const CREDIT_MODES: Record<CreditMode, CreditModeConfig> = {
  ultra: {
    id: "ultra",
    label: "Ultra Economy",
    description:
      "Minimise AI calls. Small image batches, one thumbnail first, minimal references. Best for saving credits.",
    dnaReferences: 2,
    defaultImageBatch: 5,
    initialThumbnails: 1,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description:
      "Sensible defaults. Moderate batches and one thumbnail first, with good consistency references.",
    dnaReferences: 4,
    defaultImageBatch: 10,
    initialThumbnails: 1,
  },
  best: {
    id: "best",
    label: "Best Quality",
    description:
      "Maximise fidelity. Larger batches, more references, and a few thumbnail options up-front.",
    dnaReferences: 6,
    defaultImageBatch: 20,
    initialThumbnails: 3,
  },
};

export const DEFAULT_CREDIT_MODE: CreditMode = "balanced";

export function getCreditMode(): CreditMode {
  const v = readLocal<CreditMode>(KEY, DEFAULT_CREDIT_MODE);
  return v in CREDIT_MODES ? v : DEFAULT_CREDIT_MODE;
}

export function setCreditMode(mode: CreditMode) {
  writeLocal(KEY, mode);
}

export function getCreditConfig(): CreditModeConfig {
  return CREDIT_MODES[getCreditMode()];
}

/** React hook — current Credit Saver Mode config. */
export function useCreditConfig(): CreditModeConfig {
  const mode = useLocal<CreditMode>(KEY, DEFAULT_CREDIT_MODE);
  return CREDIT_MODES[mode in CREDIT_MODES ? mode : DEFAULT_CREDIT_MODE];
}