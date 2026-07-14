// Client-side background removal for the uploaded stickman reference.
// Removes near-white pixels by sampling the four corners, then lets the
// user refine with erase/restore brushes.

export interface BgRemoveOptions {
  /** 0–255. Higher = more aggressive removal. */
  tolerance?: number;
}

export async function removeWhiteBackground(
  dataUrl: string,
  opts: BgRemoveOptions = {},
): Promise<string> {
  const tolerance = opts.tolerance ?? 32;
  const img = await loadHtmlImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;

  // Sample the four corners to learn the background colour.
  const w = canvas.width;
  const h = canvas.height;
  const corners = [
    idxAt(0, 0, w),
    idxAt(w - 1, 0, w),
    idxAt(0, h - 1, w),
    idxAt(w - 1, h - 1, w),
  ];
  let br = 0, bg = 0, bb = 0;
  for (const i of corners) {
    br += d[i];
    bg += d[i + 1];
    bb += d[i + 2];
  }
  br /= 4; bg /= 4; bb /= 4;

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - br;
    const dg = d[i + 1] - bg;
    const db = d[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tolerance) {
      d[i + 3] = 0;
    } else if (dist < tolerance * 2) {
      // Soft edge
      d[i + 3] = Math.min(d[i + 3], Math.round(((dist - tolerance) / tolerance) * 255));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

function idxAt(x: number, y: number, w: number) {
  return (y * w + x) * 4;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

/** Apply a circular brush (erase or restore alpha) at (x,y) on a data URL. */
export async function brushAlpha(
  dataUrl: string,
  x: number,
  y: number,
  radius: number,
  mode: "erase" | "restore",
  originalDataUrl?: string,
): Promise<string> {
  const img = await loadHtmlImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  if (mode === "erase") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (originalDataUrl) {
    const original = await loadHtmlImage(originalDataUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(original, 0, 0);
    ctx.restore();
  }
  return canvas.toDataURL("image/png");
}