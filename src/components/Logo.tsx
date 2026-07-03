import { cn } from "@/lib/utils";

/**
 * Stickmax brand mark — a friendly stickman inside a rounded blue play button.
 * Flat, sharp, single accent color so it reads well as a favicon/app icon and
 * inverts cleanly in light and dark mode.
 */
export function LogoMark({
  className,
  brand = "var(--brand)",
  figure = "var(--brand-foreground)",
}: {
  className?: string;
  brand?: string;
  figure?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* rounded play-button tile */}
      <rect x="1" y="1" width="30" height="30" rx="9" fill={brand} />
      {/* stickman: head + arms raised + legs (playful "max" energy) */}
      <g stroke={figure} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="16" cy="9.5" r="2.6" fill={figure} stroke="none" />
        <path d="M16 12.4 V19" />
        <path d="M16 14 L11 11.5" />
        <path d="M16 14 L21 11.5" />
        <path d="M16 19 L12 24" />
        <path d="M16 19 L20 24" />
      </g>
    </svg>
  );
}

/** Full logo lockup: brand tile + friendly bold wordmark. */
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
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8 shrink-0 drop-shadow-sm" />
      {showWordmark && (
        <span
          className={cn(
            "font-display text-lg font-bold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          Stickmax <span className="text-brand">Studio</span>
        </span>
      )}
    </div>
  );
}

/** Animated loading logo — the stickman pops and the tile pulses. */
export function LogoLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3", className)}
      role="status"
      aria-label="Loading Stickmax Studio"
    >
      <div className="sm-pop">
        <LogoMark className="h-14 w-14" />
      </div>
      <span className="font-display text-sm font-semibold tracking-tight text-muted-foreground">
        Stickmax Studio
      </span>
      <style>{`
        .sm-pop { animation: sm-bounce 1.2s var(--ease-spring) infinite; }
        @keyframes sm-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          45%      { transform: translateY(-8px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}

export default Logo;
