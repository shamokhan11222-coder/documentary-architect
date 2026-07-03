// Lightweight device capability detection. On low-powered devices (few CPU
// cores, little memory) or when the user prefers reduced motion, we add a
// `perf-lite` class to <html>. CSS then drops the most expensive effects
// (heavy backdrop blur / saturate) so scrolling and navigation stay smooth.
export function applyPerfProfile() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const saveData = Boolean((nav as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    const smallViewport = window.innerWidth < 768;
    const highDensityMobile = smallViewport && window.devicePixelRatio > 1.25;
    const lite = cores <= 6 || memory <= 6 || !!reducedMotion || saveData || highDensityMobile;
    document.documentElement.classList.toggle("perf-lite", lite);
  } catch {
    /* ignore — keep full effects on detection failure */
  }
}