import { toast } from "sonner";
import { reportLovableError } from "./lovable-error-reporting";

/**
 * Installs window-level guards that catch errors escaping React boundaries
 * (async work in event handlers, background timers, promise rejections).
 *
 * Goals:
 * - never blank the page
 * - never reload
 * - preserve unsaved work (nothing is cleared here)
 * - surface a single toast per burst so we don't spam
 * - forward to Lovable error reporting for diagnostics
 */
let installed = false;
let lastToastAt = 0;

function throttle(msg: string, description?: string) {
  const now = Date.now();
  if (now - lastToastAt < 4000) return;
  lastToastAt = now;
  try {
    toast.error(msg, description ? { description } : undefined);
  } catch {
    /* ignore — Toaster may not be mounted yet */
  }
}

function messageOf(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function installGlobalErrorGuards() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error ?? new Error((event as ErrorEvent).message);
    // Ignore ResizeObserver noise and Vite HMR shims which do not affect the user.
    const msg = messageOf(err);
    if (/ResizeObserver loop/i.test(msg)) return;
    if (/Loading chunk|dynamically imported module/i.test(msg)) {
      throttle("Failed to load a page section", "Check your connection and try again.");
      return;
    }
    console.error("[global-error]", err);
    reportLovableError(err, { source: "window.onerror" });
    throttle("Something went wrong", msg.slice(0, 200));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const msg = messageOf(reason);
    // Recoverable provider errors are handled inline by the callers.
    if (/CREDITS_EXHAUSTED|Provider unavailable/i.test(msg)) return;
    console.error("[unhandled-rejection]", reason);
    reportLovableError(reason, { source: "unhandledrejection" });
    throttle("Background task failed", msg.slice(0, 200));
  });
}