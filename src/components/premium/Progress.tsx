import * as React from "react";
import { cn } from "@/lib/utils";

export interface PProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Omit for an indeterminate bar. */
  value?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  label?: string;
}

const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } as const;

/** Premium progress bar with determinate + indeterminate modes. */
export const PProgress = React.forwardRef<HTMLDivElement, PProgressProps>(
  ({ className, value, size = "md", showValue = false, label, ...props }, ref) => {
    const indeterminate = value === undefined;
    const pct = Math.max(0, Math.min(100, value ?? 0));
    return (
      <div ref={ref} className={cn("flex w-full flex-col gap-1.5", className)} {...props}>
        {(label || showValue) && (
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{label}</span>
            {showValue && !indeterminate && <span className="tabular-nums">{Math.round(pct)}%</span>}
          </div>
        )}
        <div
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn("relative w-full overflow-hidden rounded-full bg-brand/15", heights[size])}
        >
          {indeterminate ? (
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand [animation:var(--animate-progress-indeterminate)]" />
          ) : (
            <div
              className="relative h-full overflow-hidden rounded-full bg-brand shadow-glow transition-[width] duration-700 ease-out glass-sheen"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
    );
  },
);
PProgress.displayName = "PProgress";
