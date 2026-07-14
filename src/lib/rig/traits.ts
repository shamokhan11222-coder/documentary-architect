import type { RigTraits } from "./rig-model";
import { DEFAULT_TRAITS } from "./rig-model";

// Extremely simple trait extraction. We measure the transparent-bg PNG to
// derive rough tokens (head size, line thickness, ink colour). The user can
// override every field in the Rig Lab.
export async function extractTraits(transparentPngDataUrl: string): Promise<RigTraits> {
  const img = await loadImg(transparentPngDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let inkCount = 0;
  let rSum = 0, gSum = 0, bSum = 0;
  // Row-run widths — proxy for line thickness.
  const runs: number[] = [];

  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a > 40) {
        inkCount++;
        rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        run++;
      } else if (run > 0) {
        if (run < width / 3) runs.push(run);
        run = 0;
      }
    }
    if (run > 0 && run < width / 3) runs.push(run);
  }

  if (inkCount === 0) return { ...DEFAULT_TRAITS };

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  // Scale to canonical 200x260 viewbox.
  const scale = 260 / Math.max(bboxH, 1);
  const medianRun = runs.length ? median(runs) * scale : DEFAULT_TRAITS.lineThickness;
  const lineThickness = clamp(medianRun, 2, 10);
  // Head is the topmost blob; assume ~20-30% of the height.
  const headRadius = clamp((bboxW * scale) * 0.28, 14, 36);

  const r = Math.round(rSum / inkCount);
  const g = Math.round(gSum / inkCount);
  const b = Math.round(bSum / inkCount);
  const strokeColor = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

  return {
    ...DEFAULT_TRAITS,
    lineThickness: Math.round(lineThickness),
    headRadius: Math.round(headRadius),
    strokeColor,
    outlineRoughness: 0.3,
  };
}

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}