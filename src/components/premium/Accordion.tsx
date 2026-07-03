import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./tokens";

export const PAccordion = AccordionPrimitive.Root;

export const PAccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      "overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-colors data-[state=open]:border-brand/40",
      className,
    )}
    {...props}
  />
));
PAccordionItem.displayName = "PAccordionItem";

export const PAccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex flex-1 cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold",
        "transition-colors hover:text-brand",
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-180 group-data-[state=open]:text-brand" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
PAccordionTrigger.displayName = "PAccordionTrigger";

export const PAccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    className="overflow-hidden text-sm text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("px-5 pb-5 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
PAccordionContent.displayName = "PAccordionContent";
