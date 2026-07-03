import * as React from "react";
import { cn } from "@/lib/utils";
import { spacing, radius, shadow, type Spacing, type Radius, type Shadow } from "./tokens";

export interface PCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "solid" | "glass" | "outline";
  padding?: Spacing;
  rounded?: Radius;
  elevation?: Shadow;
  /** Lifts and glows on hover. */
  interactive?: boolean;
}

/** Premium surface card built on the shared spacing / radius / shadow systems. */
export const PCard = React.forwardRef<HTMLDivElement, PCardProps>(
  (
    {
      className,
      variant = "solid",
      padding = "lg",
      rounded = "lg",
      elevation = "card",
      interactive = false,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "text-card-foreground",
        variant === "solid" && "bg-card border border-border",
        variant === "glass" && "glass",
        variant === "outline" && "border border-border bg-transparent",
        variant !== "glass" && shadow[elevation],
        radius[rounded],
        spacing[padding],
        interactive && "card-lift glass-reflect cursor-pointer",
        className,
      )}
      {...props}
    />
  ),
);
PCard.displayName = "PCard";

export function PCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function PCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-lg font-bold tracking-tight", className)} {...props} />;
}

export function PCardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function PCardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex items-center gap-3", className)} {...props} />;
}
