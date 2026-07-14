// Credit Saver Mode — a dedicated, global control for Lovable AI Gateway image
// spend. This is SEPARATE from the older "Credit Saver Mode" (credit-mode.ts)
// which shaped batch sizes and reference counts across the whole app. This
// module governs the three Gateway concerns the user cares about:
//
//   1. Which Gateway image model to bill against (Saver / Balanced / Quality).
//   2. Output dimensions per purpose (storyboard vs final thumbnail).
//   3. Maximum reference images sent per request (hard cap = 2 in Saver).
//
// Nothing here talks to a provider directly — it is pure configuration read
// by the gateway client and the queue UI.
import { readLocal, writeLocal, useLocal } from "./local";

export type CreditSaverTier = "saver" | "balanced" | "quality";

export interface CreditSaverTierConfig {
  id: CreditSaverTier;
  label: string;
  model: string;
  /** Rough per-image credit estimate (workspace credits, not build credits). */
  estimatedCredits: number;
  description: string;
}

export const CREDIT_SAVER_TIERS: Record<CreditSaverTier, CreditSaverTierConfig> = {
  saver: {
    id: "saver",
    label: "Saver",
    model: "google/gemini-3.1-flash-lite-image",
    estimatedCredits: 2,
    description: "Cheapest Gemini image tier. Best for iterating on storyboards.",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    model: "google/gemini-3.1-flash-image",
    estimatedCredits: 5,
    description: "Faster Nano Banana 2. Good default when Saver isn't sharp enough.",
  },
  quality: {
    id: "quality",
    label: "Quality",
    model: "google/gemini-3-pro-image",
    estimatedCredits: 12,
    description: "Highest-quality Gemini image model. Use only for final thumbnails.",
  },
};

const MODE_KEY = "docos.creditSaver.enabled";
const TIER_KEY = "docos.creditSaver.tier";

export function getCreditSaverEnabled(): boolean {
  return readLocal<boolean>(MODE_KEY, true);
}
export function setCreditSaverEnabled(v: boolean) {
  writeLocal(MODE_KEY, v);
}
export function useCreditSaverEnabled(): boolean {
  return useLocal<boolean>(MODE_KEY, true);
}

export function getCreditSaverTier(): CreditSaverTier {
  const v = readLocal<CreditSaverTier>(TIER_KEY, "saver");
  return v in CREDIT_SAVER_TIERS ? v : "saver";
}
export function setCreditSaverTier(t: CreditSaverTier) {
  writeLocal(TIER_KEY, t);
}
export function useCreditSaverTier(): CreditSaverTier {
  const v = useLocal<CreditSaverTier>(TIER_KEY, "saver");
  return v in CREDIT_SAVER_TIERS ? v : "saver";
}

/** Effective Gateway model given the current Saver state + tier selection. */
export function activeGatewayModel(): string {
  const tier = getCreditSaverTier();
  return CREDIT_SAVER_TIERS[tier].model;
}

/** Estimated credits for the active tier — approximate, real cost comes from
 *  the gateway logs after the request completes. */
export function estimatedCreditsPerImage(): number {
  return CREDIT_SAVER_TIERS[getCreditSaverTier()].estimatedCredits;
}

export type ImagePurpose = "storyboard" | "thumbnail" | "test";

/** Output pixel size chosen to minimise credits: storyboards are 1024×576,
 *  only the final thumbnail earns the full 1280×720. */
export function targetDimensions(purpose: ImagePurpose): { width: number; height: number } {
  if (purpose === "thumbnail") return { width: 1280, height: 720 };
  if (purpose === "test") return { width: 1024, height: 576 };
  return { width: 1024, height: 576 };
}

/** Maximum reference images per request. Saver Mode hard-caps at 2
 *  (one character reference + one style reference). */
export function referenceCap(): number {
  return getCreditSaverEnabled() ? 2 : 4;
}

/** Friendly copy for the pre-generation confirmation dialog. */
export function confirmationSummary(count: number, purpose: ImagePurpose): string {
  const tier = CREDIT_SAVER_TIERS[getCreditSaverTier()];
  const total = count * tier.estimatedCredits;
  const dims = targetDimensions(purpose);
  return [
    `Images to generate: ${count}`,
    `Model: ${tier.model} (${tier.label})`,
    `Size: ${dims.width}×${dims.height}`,
    `Estimated credits: ~${total} workspace credits (${tier.estimatedCredits} per image, actual cost from Gateway logs)`,
  ].join("\n");
}

/** Human-friendly error when the Gateway rejects with 402 (no credits). */
export const NO_GATEWAY_CREDITS_MESSAGE =
  "Lovable AI Gateway credits are empty. Add workspace usage credits before generating.";

/** Note the distinction between the two credit pools — used by the settings UI. */
export const CREDIT_POOL_NOTE =
  "Lovable build credits (used by the editor) and Lovable AI Gateway usage credits (used when your published app generates images) are separate pools and cannot be substituted for each other.";