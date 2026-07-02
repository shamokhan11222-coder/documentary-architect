import { cn } from "@/lib/utils";

/**
 * Stickmax brand mark — a sharp, flat double-chevron "ascend / max" symbol.
 * No gradients, sharp edges (miter joins), single-color so it inverts cleanly
 * in light and dark mode. `color` defaults to the brand blue but can be set to
 * "currentColor" to inherit the surrounding text color.
 */
export function LogoMark({
  className,
  color = "var(--brand)",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 12.5 L12 5 L20 12.5"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="M4 18.5 L12 11 L20 18.5"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** Full logo lockup: square brand tile + wordmark. */
export function Logo({
  className,
  showWordmark = true,
  wordmarkClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand">
        <LogoMark className="h-4 w-4" color="var(--brand-foreground)" />
      </span>
      {showWordmark && (
        <span
          className={cn(
            "text-sm font-semibold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          Stickmax Studio
        </span>
      )}
    </div>
  );
}

/** Animated loading logo — the two chevrons draw in and pulse. */
export function LogoLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3", className)}
      role="status"
      aria-label="Loading Stickmax Studio"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-12 w-12"
        aria-hidden="true"
      >
        <path
          className="sm-stroke sm-stroke-1"
          d="M4 12.5 L12 5 L20 12.5"
          stroke="var(--brand)"
          strokeWidth="2.6"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          className="sm-stroke sm-stroke-2"
          d="M4 18.5 L12 11 L20 18.5"
          stroke="var(--brand)"
          strokeWidth="2.6"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
      <span className="text-xs font-medium tracking-wide text-muted-foreground">
        Stickmax Studio
      </span>
      <style>{`
        .sm-stroke {
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          animation: sm-draw 1.4s ease-in-out infinite;
        }
        .sm-stroke-2 { animation-delay: 0.18s; }
        @keyframes sm-draw {
          0%   { stroke-dashoffset: 24; opacity: 0.3; }
          45%  { stroke-dashoffset: 0;  opacity: 1; }
          75%  { stroke-dashoffset: 0;  opacity: 1; }
          100% { stroke-dashoffset: -24; opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

export default Logo;