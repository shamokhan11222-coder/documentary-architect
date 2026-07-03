import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { focusRing } from "./tokens";

const buttonVariants = cva(
  cn(
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold cursor-pointer",
    "transition-all duration-200 ease-out active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    focusRing,
  ),
  {
    variants: {
      variant: {
        brand:
          "bg-brand text-brand-foreground shadow-soft hover:-translate-y-0.5 hover:shadow-glow",
        solid:
          "bg-primary text-primary-foreground shadow-soft hover:-translate-y-0.5 hover:shadow-card",
        outline:
          "border border-border bg-background/60 shadow-soft hover:bg-accent hover:text-accent-foreground hover:border-brand/40",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        glass:
          "glass text-foreground shadow-card hover:-translate-y-0.5 hover:shadow-lift",
        destructive:
          "bg-destructive text-destructive-foreground shadow-soft hover:-translate-y-0.5 hover:brightness-105",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-lg px-3.5 text-xs",
        md: "h-11 px-5 text-sm",
        lg: "h-12 rounded-2xl px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "brand", size: "md" },
  },
);

export interface PButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

/** Premium button — unified radius, shadow and focus treatment. */
export const PButton = React.forwardRef<HTMLButtonElement, PButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
PButton.displayName = "PButton";

export { buttonVariants as pButtonVariants };
