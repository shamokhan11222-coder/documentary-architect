import type { ExportConfig } from "./types";

export const RESOLUTIONS: Record<ExportConfig["resolution"], { w: number; h: number }> = {
  "1080p": { w: 1920, h: 1080 },
  "1440p": { w: 2560, h: 1440 },
  "4K": { w: 3840, h: 2160 },
};

export function estimateBitrate(cfg: ExportConfig): number {
  const { w, h } = RESOLUTIONS[cfg.resolution];
  const pixels = w * h;
  const perPixel = cfg.fps === 60 ? 0.15 : 0.1;
  return Math.round((pixels * perPixel) / 1000); // kbps
}

export function estimateFileSizeMb(cfg: ExportConfig, durationSec: number): number {
  const kbps = estimateBitrate(cfg);
  return Math.round(((kbps * durationSec) / 8) / 1024);
}

export function exportSummary(cfg: ExportConfig) {
  const dim = RESOLUTIONS[cfg.resolution];
  return {
    dimensions: `${dim.w}×${dim.h}`,
    fps: `${cfg.fps} fps`,
    bitrateKbps: estimateBitrate(cfg),
    codec: "H.264 (High Profile)",
    container: "MP4",
  };
}