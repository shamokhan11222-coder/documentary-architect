// Combine every completed voice block for a topic into one WAV file plus a
// narration-timing JSON. Runs client-side — decodes the stored data URLs,
// concatenates the PCM, and returns Blobs the UI can download.
import { loadImage } from "../images";
import { voiceBlockId, getVoiceMeta } from "../generate-voice";
import { concatSegments, encodeWav, type AudioSegment } from "./wav";
import type { VoiceBlock } from "../types";

export interface NarrationTimingBlock {
  blockIndex: number;
  start: number;
  end: number;
  duration: number;
  text: string;
}

export interface NarrationTiming {
  totalDuration: number;
  blocks: NarrationTimingBlock[];
}

async function decodeWav(dataUrl: string): Promise<AudioSegment | null> {
  try {
    const res = await fetch(dataUrl);
    const buf = new Uint8Array(await res.arrayBuffer());
    // Locate the "data" chunk (WAVs may include unexpected chunks before it).
    let offset = 12;
    let dataOffset = -1;
    let dataSize = 0;
    let sampleRate = 24000;
    let bitsPerSample = 16;
    const view = new DataView(buf.buffer);
    while (offset < buf.length - 8) {
      const id = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
      const size = view.getUint32(offset + 4, true);
      if (id === "fmt ") {
        sampleRate = view.getUint32(offset + 8 + 4, true);
        bitsPerSample = view.getUint16(offset + 8 + 14, true);
      } else if (id === "data") {
        dataOffset = offset + 8;
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (dataOffset < 0 || bitsPerSample !== 16) return null;
    const samples = new Float32Array(dataSize / 2);
    for (let i = 0, o = dataOffset; i < samples.length; i++, o += 2) {
      samples[i] = view.getInt16(o, true) / 0x8000;
    }
    return { samples, sampleRate };
  } catch {
    return null;
  }
}

export async function exportFullNarration(
  topicId: string,
  blocks: VoiceBlock[],
  paragraphPauseMs = 500,
): Promise<{ wav: Blob; timing: NarrationTiming } | null> {
  const ordered = [...blocks].sort((a, b) => a.index - b.index);
  const segments: AudioSegment[] = [];
  const timing: NarrationTimingBlock[] = [];
  let cursor = 0;
  const gap = paragraphPauseMs / 1000;
  for (const b of ordered) {
    const dataUrl = await loadImage(voiceBlockId(topicId, b.index));
    if (!dataUrl) continue;
    const seg = await decodeWav(dataUrl);
    if (!seg) continue;
    const meta = getVoiceMeta(voiceBlockId(topicId, b.index));
    const duration = meta?.duration ?? seg.samples.length / seg.sampleRate;
    timing.push({
      blockIndex: b.index,
      start: cursor,
      end: cursor + duration,
      duration,
      text: b.text,
    });
    cursor += duration + gap;
    segments.push(seg);
  }
  if (!segments.length) return null;
  const combined = concatSegments(segments, gap);
  const wav = encodeWav(combined);
  return {
    wav,
    timing: {
      totalDuration: combined.samples.length / combined.sampleRate,
      blocks: timing,
    },
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}