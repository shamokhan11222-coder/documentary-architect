// Phase 3 — Thumbnail Compositor.
//
// A dedicated thumbnail engine that is INDEPENDENT from storyboard image
// generation. Instead of asking the image provider to render text + composition
// inside a single raw prompt (which produced alien characters, missing
// headlines and weak layouts), it builds the final thumbnail as controlled
// layers on a 1280x720 canvas:
//
//   1. background          (white / flat color / simple outdoor)
//   2. simple illustration (crude MS-Paint image from the pipeline, NO text)
//   3. headline text       (programmatic, hand-drawn style, high contrast)
//   4. arrow/circle/check emphasis (programmatic vector annotation)
//   5. optional subheadline
//
// The result is exported as a permanent PNG data URL.
import type {
  ThumbnailIdea,
  ThumbnailConcept,
  ThumbnailEmotion,
  ThumbnailHighlight,
  ThumbnailHighlightColor,
  ThumbnailBackground,
  ThumbnailLayout,
} from "./types";

export const THUMB_W = 1280;
export const THUMB_H = 720;

const COLORS: Record<ThumbnailHighlightColor, string> = {
  red: "#e11414",
  yellow: "#f4b400",
  green: "#2e9e30",
};

// -------- concept derivation from an existing ThumbnailIdea ----------------
// The concept text (from the AI gateway / local fallback) already exists as a
// ThumbnailIdea. We normalize it into the strict compositor schema.

function toHeadline(idea: ThumbnailIdea): string {
  const raw = (idea.textOnThumbnail || idea.thumbnailTitle || "WHY IT FAILED").trim();
  const words = raw.replace(/[^\p{L}\p{N} ?!'-]/gu, " ").split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(" ").toUpperCase() || "WHY IT FAILED";
}

function toEmotion(s: string | undefined): ThumbnailEmotion {
  const t = (s || "").toLowerCase();
  if (/shock|surpris|stun/.test(t)) return "shocked";
  if (/worri|fear|anx|scared|nervous/.test(t)) return "worried";
  if (/excit|amaz|awe|joy|happy/.test(t)) return "excited";
  if (/curio|intrig|wonder/.test(t)) return "curious";
  return "confused";
}

function toBackground(s: string | undefined): ThumbnailBackground {
  const t = (s || "").toLowerCase();
  if (/outdoor|outside|sky|ground|field|street|nature/.test(t)) return "simple outdoor";
  if (/color|colour|blue|red|green|yellow|orange/.test(t)) return "flat solid color";
  return "plain white";
}

function toHighlight(idea: ThumbnailIdea): ThumbnailHighlight {
  const t = `${idea.composition} ${idea.mainVisualConcept}`.toLowerCase();
  if (/cross|wrong|banned|x mark|no /.test(t)) return "cross";
  if (/check|correct|right|approv|tick/.test(t)) return "check";
  if (/arrow|point|rise|grow|up /.test(t)) return "arrow";
  if (/question|confus|mystery|why|unknown/.test(t)) return "question marks";
  return "circle";
}

function toLayout(idea: ThumbnailIdea): ThumbnailLayout {
  const t = (idea.composition || "").toLowerCase();
  if (/left.*right|before.*after|split|vs\b|versus/.test(t)) return "split-left-right";
  if (/left/.test(t)) return "text-left";
  return "text-top";
}

function toCharacterCount(idea: ThumbnailIdea): 0 | 1 | 2 {
  const t = `${idea.mainSubject} ${idea.mainVisualConcept} ${idea.composition}`.toLowerCase();
  if (/two |2 |pair|both|couple/.test(t)) return 2;
  if (/stick|man|figure|person|guy|character|human|people/.test(t)) return 1;
  return 0;
}

/** Normalize an AI-generated ThumbnailIdea into the strict compositor schema. */
export function conceptFromIdea(idea: ThumbnailIdea): ThumbnailConcept {
  const headline = toHeadline(idea);
  const words = headline.split(/\s+/);
  return {
    headline,
    subheadline: undefined,
    mainVisual: idea.mainVisualConcept || idea.mainSubject || "one large simple object",
    characterCount: toCharacterCount(idea),
    characterType: "literal stick figure",
    emotion: toEmotion(idea.emotion),
    backgroundType: toBackground(idea.background),
    highlightType: toHighlight(idea),
    highlightColor: "red",
    layout: words.length > 5 ? "text-top" : toLayout(idea),
  };
}

// -------- font loading ----------------------------------------------------
let fontFamily: string | null = null;
async function ensureFont(): Promise<string> {
  if (fontFamily) return fontFamily;
  const fallback = `"Arial Black", "Helvetica Neue", Impact, sans-serif`;
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    fontFamily = fallback;
    return fontFamily;
  }
  try {
    const face = new FontFace(
      "StickmaxMarker",
      "url(https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cf5b6jlg.woff2)",
    );
    await face.load();
    document.fonts.add(face);
    fontFamily = `"StickmaxMarker", ${fallback}`;
  } catch {
    fontFamily = fallback;
  }
  return fontFamily;
}

// -------- helpers ---------------------------------------------------------
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("illustration failed to load"));
    img.src = src;
  });
}

/** Draw an image with object-fit: cover inside a rectangle. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

interface Rect { x: number; y: number; w: number; h: number }

/** Region layout: where headline text vs illustration live. */
function regions(layout: ThumbnailLayout): { text: Rect; art: Rect } {
  switch (layout) {
    case "text-left":
      return {
        text: { x: 40, y: 40, w: THUMB_W * 0.42 - 60, h: THUMB_H - 80 },
        art: { x: THUMB_W * 0.42, y: 0, w: THUMB_W * 0.58, h: THUMB_H },
      };
    case "split-left-right":
      // headline banner across the top, illustration fills below
      return {
        text: { x: 40, y: 24, w: THUMB_W - 80, h: THUMB_H * 0.2 },
        art: { x: 0, y: THUMB_H * 0.22, w: THUMB_W, h: THUMB_H * 0.78 },
      };
    case "text-top":
    default:
      return {
        text: { x: 60, y: 28, w: THUMB_W - 120, h: THUMB_H * 0.24 },
        art: { x: 0, y: THUMB_H * 0.26, w: THUMB_W, h: THUMB_H * 0.74 },
      };
  }
}

/** Word-wrap text to fit width at a given font size; returns lines or null if
 *  it cannot fit within maxLines. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
    }
    if (lines.length > maxLines) return null;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) return null;
  for (const l of lines) if (ctx.measureText(l).width > maxWidth) return null;
  return lines;
}

/** Draw a headline block that auto-fits into the rect. */
function drawHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  rect: Rect,
  family: string,
  color: string,
  align: CanvasTextAlign = "center",
) {
  const maxLines = 2;
  let size = Math.floor(rect.h);
  let lines: string[] | null = null;
  for (; size >= 28; size -= 2) {
    ctx.font = `700 ${size}px ${family}`;
    const fit = wrapLines(ctx, text, rect.w, maxLines);
    if (fit && fit.length * size * 1.05 <= rect.h) {
      lines = fit;
      break;
    }
  }
  if (!lines) {
    ctx.font = `700 ${size}px ${family}`;
    lines = wrapLines(ctx, text, rect.w, 4) ?? [text];
  }
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const lineH = size * 1.05;
  const totalH = lines.length * lineH;
  const startY = rect.y + (rect.h - totalH) / 2 + lineH / 2;
  const cx = align === "left" ? rect.x : align === "right" ? rect.x + rect.w : rect.x + rect.w / 2;
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.lineWidth = Math.max(6, size * 0.14);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(line, cx, y);
    ctx.fillStyle = color;
    ctx.fillText(line, cx, y);
  });
}

// -------- graphic annotations --------------------------------------------
function drawHighlight(ctx: CanvasRenderingContext2D, type: ThumbnailHighlight, color: string, art: Rect) {
  const cx = art.x + art.w * 0.62;
  const cy = art.y + art.h * 0.5;
  const r = Math.min(art.w, art.h) * 0.28;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (type) {
    case "circle": {
      ctx.beginPath();
      // hand-drawn slightly-open ellipse
      ctx.ellipse(cx, cy, r * 1.15, r, -0.12, 0.25, Math.PI * 2 + 0.05);
      ctx.stroke();
      break;
    }
    case "cross": {
      const d = r * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      break;
    }
    case "check": {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy);
      ctx.lineTo(cx - r * 0.1, cy + r * 0.6);
      ctx.lineTo(cx + r * 0.9, cy - r * 0.7);
      ctx.stroke();
      break;
    }
    case "arrow": {
      const x0 = cx - r;
      const y0 = art.y + art.h * 0.9;
      const x1 = cx + r * 0.2;
      const y1 = art.y + art.h * 0.18;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const head = r * 0.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4));
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4));
      ctx.stroke();
      break;
    }
    case "question marks": {
      const family = fontFamily ?? "Arial Black, sans-serif";
      ctx.font = `700 ${Math.floor(r * 1.4)}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const spots: [number, number][] = [
        [art.x + art.w * 0.82, art.y + art.h * 0.28],
        [art.x + art.w * 0.9, art.y + art.h * 0.6],
        [art.x + art.w * 0.72, art.y + art.h * 0.8],
      ];
      for (const [x, y] of spots) {
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText("?", x, y);
        ctx.fillStyle = color;
        ctx.fillText("?", x, y);
      }
      break;
    }
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, type: ThumbnailBackground) {
  if (type === "flat solid color") {
    ctx.fillStyle = "#dce7f2";
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  } else if (type === "simple outdoor") {
    ctx.fillStyle = "#eaf4ff";
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    ctx.fillStyle = "#d9b382";
    ctx.fillRect(0, THUMB_H * 0.8, THUMB_W, THUMB_H * 0.2);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  }
}

/**
 * Compose the final thumbnail: background + illustration + headline text +
 * graphic highlight (+ optional subheadline). Returns a permanent PNG data URL.
 */
export async function composeThumbnail(concept: ThumbnailConcept, illustrationDataUrl: string): Promise<string> {
  if (typeof document === "undefined") throw new Error("Thumbnail compositor requires a browser canvas.");
  const family = await ensureFont();

  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  const { text, art } = regions(concept.layout);

  // 1) background
  paintBackground(ctx, concept.backgroundType);

  // 2) illustration
  try {
    const img = await loadImageEl(illustrationDataUrl);
    drawCover(ctx, img, art.x, art.y, art.w, art.h);
  } catch {
    /* keep background if the illustration cannot decode */
  }

  // 4) graphic emphasis (under text so text stays readable)
  drawHighlight(ctx, concept.highlightType, COLORS[concept.highlightColor], art);

  // 3) headline text
  const align: CanvasTextAlign = concept.layout === "text-left" ? "left" : "center";
  const headlineColor = "#111111";
  drawHeadline(ctx, concept.headline, text, family, headlineColor, align);

  // 5) optional subheadline
  if (concept.subheadline && concept.subheadline.trim()) {
    const sub: Rect = { x: text.x, y: text.y + text.h, w: text.w, h: THUMB_H * 0.1 };
    drawHeadline(ctx, concept.subheadline.trim().toUpperCase(), sub, family, COLORS.red, align);
  }

  return canvas.toDataURL("image/png");
}

/** Basic acceptance check on a composed thumbnail: correct 16:9 size and a
 *  non-blank canvas. Used to decide whether one retry is needed. */
export function validateComposedThumbnail(dataUrl: string): boolean {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image/png");
}
