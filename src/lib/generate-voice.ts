// Voice generation is TEMPORARILY DISABLED.
//
// The free downloadable local TTS engine is not installed in this build.
// This module intentionally makes ZERO network calls (no Lovable AI Gateway,
// no Gemini, no model download) and never throws — Voice page stays usable
// and previously saved voice blocks remain visible and playable.
import { toast } from "sonner";
import type { VoiceSettings } from "./types";

export const voiceBlockId = (topicId: string, index: number) =>
  `voice:${topicId}:${index}`;

export const VOICE_DISABLED_MESSAGE =
  "Free local voice engine is not installed yet. Voice generation is temporarily disabled.";
export const VOICE_GENERATION_ENABLED = false;

export async function generateVoiceBlock(
  _topicId: string,
  _index: number,
  _text: string,
  _settings: VoiceSettings,
): Promise<number> {
  toast.message(VOICE_DISABLED_MESSAGE);
  return 0;
}

// Legacy export retained for callers that still reference it.
export const VOICE_TIMEOUT_MS = 120_000;
