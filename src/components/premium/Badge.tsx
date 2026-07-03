import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        brand: "border-transparent bg-brand/12 text-brand",
        neutral: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        warning: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
        danger: "border-transparent bg-destructive/15 text-destructive",
        outline: "border-border text-foreground",
      },
      dot: { true: "", false: "" },
    },
    defaultVariants: { variant: "brand", dot: false },
  },
);

export interface PBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const dotColor: Record<string, string> = {
  brand: "bg-brand",
  neutral: "bg-muted-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  outline: "bg-foreground",
};

/** Premium status badge with an optional live dot. */
export function PBadge({ className, variant, dot, children, ...props }: PBadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, dot }), className)} {...props}>
      {dot && (
        <span className={cn("size-1.5 rounded-full", dotColor[variant ?? "brand"])} />
      )}
      {children}
    </span>
  );
}

export { badgeVariants as pBadgeVariants };
