import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
  /** Name of the region for logs + toast copy (e.g. "route", "sidebar"). */
  region?: string;
  /**
   * When true, render nothing on error (useful for non-essential surfaces
   * like the AI chat / debug panel — we never want them to blank the app).
   */
  silent?: boolean;
  /** Optional custom fallback renderer. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  key: number;
}

/**
 * App-level error boundary that keeps the shell mounted when a subtree
 * crashes. Unlike the TanStack route errorComponent, this one renders an
 * inline recovery card *inside* the layout, so the sidebar / topbar stay
 * visible and unsaved local state (localStorage-backed store) is preserved.
 *
 * Hooks-order rule: never render inside a conditional above hooks. This is
 * a class component precisely so it can catch a "Rendered fewer hooks" style
 * error thrown by children without itself being subject to the same rule.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    const region = this.props.region ?? "app";
    // Log the exact crashing region + stack for post-mortem.
    console.error(`[AppErrorBoundary:${region}]`, error?.message ?? error);
    if (info?.componentStack) {
      console.error(`[AppErrorBoundary:${region}] component stack:`, info.componentStack);
    }
    reportLovableError(error, { boundary: "AppErrorBoundary", region });
    if (!this.props.silent) {
      try {
        toast.error("Something went wrong on this page", {
          description: "Your work is safe. Try the action again.",
        });
      } catch {
        /* toast may fail during very early boot */
      }
    }
  }

  reset = () => {
    this.setState((s) => ({ error: null, key: s.key + 1 }));
  };

  render() {
    const { error, key } = this.state;
    if (error) {
      if (this.props.silent) return null;
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <h2 className="text-lg font-semibold">This section hit an error</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Your projects and unsaved work are safe. Try again — you don't need to reload.
            </p>
            <p className="max-w-md break-words text-xs text-muted-foreground/80">
              {error.message || String(error)}
            </p>
            <button
              onClick={this.reset}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      );
    }
    // `key` forces a fresh subtree mount on reset so a stuck render can recover.
    return <div key={key} className="contents">{this.props.children}</div>;
  }
}