import { useEffect, useRef, useState } from "react";

/**
 * Premium cursor glow.
 * - Soft blue radial glow that trails the cursor (GPU-accelerated transform).
 * - Very light background illumination + a brighter core.
 * - Intensifies slightly over buttons and cards.
 * - Auto-disabled on touch / coarse-pointer devices, when the user prefers
 *   reduced motion, and on low-core (low-performance) devices.
 */
export function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const glowRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  // Decide whether to run at all.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const hasHover = window.matchMedia("(hover: hover)").matches;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const cores = navigator.hardwareConcurrency ?? 8;
    const lowPerf = cores <= 4;
    setEnabled(finePointer && hasHover && !reducedMotion && !lowPerf);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const glow = glowRef.current;
    const core = coreRef.current;
    if (!glow || !core) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let curX = targetX;
    let curY = targetY;
    let coreX = targetX;
    let coreY = targetY;
    let intensity = 0; // 0 idle, up to ~1 over interactive elements
    let targetIntensity = 0;
    let visible = 0;
    let targetVisible = 0;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      targetVisible = 1;
      const interactive = (e.target as HTMLElement | null)?.closest(
        "button, a, [role='button'], input, select, textarea, .card-lift, [data-glow]",
      );
      targetIntensity = interactive ? 1 : 0;
    };
    const onLeave = () => {
      targetVisible = 0;
    };

    const tick = () => {
      // Lag-free easing on the transform layer.
      curX += (targetX - curX) * 0.18;
      curY += (targetY - curY) * 0.18;
      coreX += (targetX - coreX) * 0.32;
      coreY += (targetY - coreY) * 0.32;
      intensity += (targetIntensity - intensity) * 0.12;
      visible += (targetVisible - visible) * 0.12;

      const baseScale = 1 + intensity * 0.25;
      glow.style.transform = `translate3d(${curX}px, ${curY}px, 0) translate(-50%, -50%) scale(${baseScale})`;
      glow.style.opacity = String(visible * (0.55 + intensity * 0.35));
      core.style.transform = `translate3d(${coreX}px, ${coreY}px, 0) translate(-50%, -50%) scale(${1 + intensity * 0.4})`;
      core.style.opacity = String(visible * (0.35 + intensity * 0.4));

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      style={{ contain: "strict" }}
    >
      {/* Wide, very light background illumination */}
      <div
        ref={glowRef}
        className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full opacity-0 will-change-[transform,opacity]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--brand) 22%, transparent) 0%, transparent 68%)",
          filter: "blur(28px)",
        }}
      />
      {/* Brighter, tighter core */}
      <div
        ref={coreRef}
        className="absolute left-0 top-0 h-[180px] w-[180px] rounded-full opacity-0 will-change-[transform,opacity]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--brand) 40%, transparent) 0%, transparent 65%)",
          filter: "blur(16px)",
        }}
      />
    </div>
  );
}