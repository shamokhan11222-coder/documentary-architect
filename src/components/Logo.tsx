import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Stickmax brand mark — "Max", a friendly minimal stick-figure mascot who
 * waves from inside a rounded blue-gradient tile. Designed to stay crisp and
 * recognizable from 512px down to 16px (favicon) with a distinct silhouette.
 */
export function LogoMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const tileGrad = `sm-tile-${uid}`;
  const figGrad = `sm-fig-${uid}`;
  const glow = `sm-glow-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Stickmax"
    >
      <defs>
        <linearGradient id={tileGrad} x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#63A4FF" />
          <stop offset="0.52" stopColor="#3568FF" />
          <stop offset="1" stopColor="#4B45E6" />
        </linearGradient>
        <linearGradient id={figGrad} x1="16" y1="6" x2="16" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE9FF" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.32" r="0.75">
          <stop stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* rounded gradient tile */}
      <rect x="1" y="1" width="30" height="30" rx="9.5" fill={`url(#${tileGrad})`} />
      {/* soft radial top-light */}
      <rect x="1" y="1" width="30" height="30" rx="9.5" fill={`url(#${glow})`} />

      {/* Max — bold minimal stickman in a confident victory stance */}
      <g
        stroke={`url(#${figGrad})`}
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* head */}
        <circle cx="16" cy="8.4" r="3.3" fill={`url(#${figGrad})`} stroke="none" />
        {/* spine */}
        <path d="M16 11.6 V18.7" />
        {/* arms raised in a V */}
        <path d="M16 13.5 L10.8 9.4" />
        <path d="M16 13.5 L21.2 9.4" />
        {/* wide stable stance */}
        <path d="M16 18.7 L11 24.7" />
        <path d="M16 18.7 L21 24.7" />
      </g>
    </svg>
  );
}

/** Full logo lockup: mascot tile + bold wordmark. */
export function Logo({
  className,
  showWordmark = true,
  studio = false,
  wordmarkClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  /** Append the "Studio" sub-label (used inside the app / dashboard). */
  studio?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8 shrink-0 drop-shadow-sm" />
      {showWordmark && (
        <span
          className={cn(
            "font-display text-lg font-semibold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          Stickmax{studio && <span className="text-brand"> Studio</span>}
        </span>
      )}
    </div>
  );
}

/** Animated loading logo — Max bounces and waves. */
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
        Stickmax <span className="text-brand">Studio</span>
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
