import { useEffect, useState } from "react";
import { Coins, Infinity as InfinityIcon } from "lucide-react";
import { DEFAULT_CREDITS, LOW_CREDIT_THRESHOLD } from "@/lib/account";

/**
 * Premium radial credit meter. Shows remaining credits as an animated
 * gradient ring. Admins see an unlimited (∞) state that never depletes.
 */
export function CreditMeter({
  balance,
  admin = false,
  total = DEFAULT_CREDITS,
  size = 176,
}: {
  balance: number;
  admin?: boolean;
  total?: number;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // Scale the ring against the larger of the seed allowance or current balance
  // so top-ups still read as a "full" arc.
  const denom = Math.max(total, balance, 1);
  const ratio = admin ? 1 : Math.min(1, Math.max(0, balance / denom));
  const low = !admin && balance <= LOW_CREDIT_THRESHOLD;

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setProgress(ratio));
    return () => cancelAnimationFrame(t);
  }, [ratio]);

  const offset = circumference * (1 - progress);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="creditMeterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="color-mix(in oklab, var(--brand) 55%, transparent)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          className="opacity-40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={low ? "var(--destructive)" : "url(#creditMeterGrad)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            {admin ? (
              <InfinityIcon className="h-3.5 w-3.5 text-brand" />
            ) : (
              <Coins className="h-3.5 w-3.5 text-brand" />
            )}
            Remaining
          </div>
          <div
            className={`mt-1 font-display text-5xl font-bold tracking-tight tabular-nums ${
              low ? "text-destructive" : "text-foreground"
            }`}
          >
            {admin ? "∞" : balance}
          </div>
          {!admin && (
            <div className="mt-0.5 text-xs text-muted-foreground">credits left</div>
          )}
        </div>
      </div>
    </div>
  );
}
