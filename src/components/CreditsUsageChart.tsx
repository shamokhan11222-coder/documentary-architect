import { useMemo } from "react";
import { usageByDay, type CreditEntry } from "@/lib/account";

/** Elegant, dependency-free 7-day credit usage bar chart. */
export function CreditsUsageChart({
  history,
  days = 7,
}: {
  history: CreditEntry[];
  days?: number;
}) {
  const data = useMemo(() => usageByDay(history, days), [history, days]);
  const max = Math.max(1, ...data.map((d) => d.spent));
  const totalSpent = data.reduce((s, d) => s + d.spent, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-sm text-muted-foreground">Last {days} days</div>
        <div className="text-sm">
          <span className="font-semibold text-foreground">{totalSpent}</span>{" "}
          <span className="text-muted-foreground">credits used</span>
        </div>
      </div>
      <div className="mt-4 flex h-40 items-stretch gap-2">
        {data.map((d, i) => {
          const h = Math.round((d.spent / max) * 100);
          return (
            <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="relative flex h-full w-full items-end justify-center">
                <span className="pointer-events-none absolute -top-1 -translate-y-full rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {d.spent}
                </span>
                <div
                  className="chart-rise w-full max-w-[2.25rem] rounded-t-lg bg-gradient-to-t from-brand/50 to-brand transition-[height] duration-700 ease-out group-hover:from-brand group-hover:to-brand"
                  style={{ height: `${Math.max(d.spent > 0 ? 8 : 2, h)}%`, animationDelay: `${i * 60}ms` }}
                />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
