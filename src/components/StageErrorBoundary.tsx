import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
  message?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Local error boundary for stage pages (Storyboard / Thumbnail). Prevents a
 * rendering crash from taking down the whole app and shows a friendly,
 * actionable message instead of a raw stack trace.
 */
export class StageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    reportLovableError(error, { boundary: "StageErrorBoundary" });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium">
              {this.props.message ?? "Script is missing. Generate or paste a script first."}
            </p>
            <p className="text-xs text-muted-foreground">
              Your projects are safe. Add a script and try again.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}