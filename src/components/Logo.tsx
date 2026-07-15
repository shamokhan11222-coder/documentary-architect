import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";

/**
 * Stickmax brand mark — "Max", a friendly minimal stick-figure mascot who
 * waves from inside a rounded blue-gradient tile. Designed to stay crisp and
 * recognizable from 512px down to 16px (favicon) with a distinct silhouette.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Stickmax"
      className={cn("object-contain", className)}
    />
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
