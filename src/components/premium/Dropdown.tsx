import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const PDropdown = DropdownPrimitive.Root;
export const PDropdownTrigger = DropdownPrimitive.Trigger;
export const PDropdownGroup = DropdownPrimitive.Group;

export const PDropdownContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-52 overflow-hidden rounded-2xl border border-border glass p-1.5 shadow-float",
        "data-[state=open]:spring-pop data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
PDropdownContent.displayName = "PDropdownContent";

export const PDropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none",
      "transition-all focus:bg-accent focus:text-accent-foreground focus:translate-x-0.5 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      "[&_svg]:size-4 [&_svg]:text-muted-foreground",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
PDropdownItem.displayName = "PDropdownItem";

export const PDropdownLabel = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Label
    ref={ref}
    className={cn("px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)}
    {...props}
  />
));
PDropdownLabel.displayName = "PDropdownLabel";

export const PDropdownSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Separator
    ref={ref}
    className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
    {...props}
  />
));
PDropdownSeparator.displayName = "PDropdownSeparator";
