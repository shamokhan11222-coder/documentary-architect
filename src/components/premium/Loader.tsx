import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = { sm: "size-4", md: "size-6", lg: "size-9" } as const;

export interface PLoaderProps {
  size?: keyof typeof sizes;
  label?: string;
  className?: string;
}

/** Premium spinner loader. */
export function PSpinner({ size = "md", className }: { size?: keyof typeof sizes; className?: string }) {
  return <Loader2 className={cn("animate-spin text-brand", sizes[size], className)} />;
}

/** Three-dot pulsing loader. */
export function PDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-brand [animation:var(--animate-thinking)]"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

/** Centered loader block with an optional label. */
export function PLoader({ size = "md", label, className }: PLoaderProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} role="status">
      <PSpinner size={size} />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
