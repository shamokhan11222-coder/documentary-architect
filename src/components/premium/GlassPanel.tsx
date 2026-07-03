import * as React from "react";
import { cn } from "@/lib/utils";
import { spacing, radius, type Spacing, type Radius } from "./tokens";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: Spacing;
  rounded?: Radius;
  /** Adds an animated light sweep on hover. */
  sheen?: boolean;
  asChild?: boolean;
}

/** Frosted glass surface using the shared spacing + radius systems. */
export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, padding = "lg", rounded = "lg", sheen = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "glass",
        sheen && "glass-sheen",
        radius[rounded],
        spacing[padding],
        className,
      )}
      {...props}
    />
  ),
);
GlassPanel.displayName = "GlassPanel";
