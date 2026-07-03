import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./tokens";

const fieldBase = cn(
  "w-full rounded-xl border border-input bg-background/60 text-sm text-foreground",
  "placeholder:text-muted-foreground shadow-soft transition-all duration-200",
  "hover:border-brand/30 disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:border-brand/60 focus-visible:shadow-none",
  focusRing,
);

export interface PInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/** Premium text input with optional label, icons and error state. */
export const PInput = React.forwardRef<HTMLInputElement, PInputProps>(
  ({ className, label, hint, error, leftIcon, rightIcon, id, ...props }, ref) => {
    const autoId = React.useId();
    const fieldId = id ?? autoId;
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 text-muted-foreground [&_svg]:size-4">
              {leftIcon}
            </span>
          )}
          <input
            id={fieldId}
            ref={ref}
            aria-invalid={!!error}
            className={cn(
              fieldBase,
              "h-11 px-3.5",
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              error && "border-destructive/60 focus-visible:ring-destructive/40",
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 text-muted-foreground [&_svg]:size-4">{rightIcon}</span>
          )}
        </div>
        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    );
  },
);
PInput.displayName = "PInput";

export interface PTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/** Premium textarea matching PInput. */
export const PTextarea = React.forwardRef<HTMLTextAreaElement, PTextareaProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const autoId = React.useId();
    const fieldId = id ?? autoId;
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <textarea
          id={fieldId}
          ref={ref}
          aria-invalid={!!error}
          className={cn(
            fieldBase,
            "min-h-24 px-3.5 py-3",
            error && "border-destructive/60 focus-visible:ring-destructive/40",
            className,
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    );
  },
);
PTextarea.displayName = "PTextarea";
