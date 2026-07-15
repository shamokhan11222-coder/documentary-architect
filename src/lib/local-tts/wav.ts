// Minimal WAV utilities: build a mono 16-bit PCM WAV from Float32 samples,
// concatenate multiple audio segments (with optional silence gaps), and
// convert a WAV Blob into a data URL for IndexedDB storage via `putImage`.

export interface AudioSegment {
  samples: Float32Array;
  sampleRate: number;
}

export function silence(seconds: number, sampleRate: number): Float32Array {
  const n = Math.max(0, Math.floor(seconds * sampleRate));
  return new Float32Array(n);
}

export function concatSegments(
  segments: AudioSegment[],
  gapSeconds: number,
): AudioSegment {
  if (!segments.length) return { samples: new Float32Array(0), sampleRate: 24000 };
  const sr = segments[0].sampleRate;
  const gap = silence(gapSeconds, sr);
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    total += segments[i].samples.length + (i < segments.length - 1 ? gap.length : 0);
  }
  const out = new Float32Array(total);
  let off = 0;
  for (let i = 0; i < segments.length; i++) {
    out.set(segments[i].samples, off);
    off += segments[i].samples.length;
    if (i < segments.length - 1) {
      out.set(gap, off);
      off += gap.length;
    }
  }
  return { samples: out, sampleRate: sr };
}

export function encodeWav({ samples, sampleRate }: AudioSegment): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Best-effort text hash — used to skip regenerating unchanged blocks. */
export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}