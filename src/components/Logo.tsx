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
        <linearGradient id={tileGrad} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B9DFF" />
          <stop offset="0.55" stopColor="#2F6BFF" />
          <stop offset="1" stopColor="#1E4BD8" />
        </linearGradient>
        <linearGradient id={figGrad} x1="16" y1="6" x2="16" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E4EEFF" />
        </linearGradient>
      </defs>

      {/* rounded gradient tile */}
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${tileGrad})`} />
      {/* soft top-light highlight */}
      <rect x="1" y="1" width="30" height="15" rx="9" fill="#FFFFFF" opacity="0.10" />

      {/* Max — friendly waving stick figure */}
      <g
        stroke={`url(#${figGrad})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* head */}
        <circle cx="15.4" cy="9.6" r="3.5" fill={`url(#${figGrad})`} stroke="none" />
        {/* body */}
        <path d="M15.4 13.4 V19.4" />
        {/* resting arm */}
        <path d="M15.4 15.2 L11.4 17.6" />
        {/* waving arm, raised */}
        <path d="M15.4 14.4 L20.4 10.6" />
        {/* legs */}
        <path d="M15.4 19.4 L11.7 24.6" />
        <path d="M15.4 19.4 L19.6 24.4" />
      </g>
      {/* friendly greeting spark by the raised hand */}
      <circle cx="23.2" cy="8.6" r="1.15" fill="#FFFFFF" opacity="0.95" />
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
            "font-display text-lg font-bold tracking-tight text-foreground",
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
