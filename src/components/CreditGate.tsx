import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Crown, Sparkles, Zap, Rocket, ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  useCredits,
  useHasUnlimitedAccess,
  ensureRenewal,
  addCredits,
} from "@/lib/account";
import { Button } from "@/components/ui/button";

const HIDDEN_ON = ["/upgrade", "/credits", "/pricing"];

const PERKS = [
  { icon: Rocket, text: "Unlimited documentary production" },
  { icon: Sparkles, text: "Premium AI models & Ultra-HD images" },
  { icon: Zap, text: "Priority generation queue" },
];

export function CreditGate() {
  const { balance } = useCredits();
  const unlimited = useHasUnlimitedAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dismissed, setDismissed] = useState(false);

  // Grant the monthly free allowance when a renewal is due.
  useEffect(() => {
    ensureRenewal();
  }, []);

  // Allow other views to summon the gate instead of hard-redirecting.
  useEffect(() => {
    const open = () => setDismissed(false);
    window.addEventListener("open-credit-gate", open);
    return () => window.removeEventListener("open-credit-gate", open);
  }, []);

  // Reset the dismissed flag once the user has credits again.
  useEffect(() => {
    if (balance > 0) setDismissed(false);
  }, [balance]);

  const show =
    !unlimited && balance <= 0 && !dismissed && !HIDDEN_ON.includes(pathname);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-xl animate-fade-in"
        onClick={() => setDismissed(true)}
      />

      {/* Premium upgrade popup */}
      <div className="relative w-full max-w-md animate-scale-in">
        <div className="glass-card overflow-hidden rounded-3xl border border-brand/30 p-8 text-center shadow-2xl">
          {/* Glow */}
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-brand/25 blur-3xl" />

          <div className="relative">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand/60 shadow-lg animate-float">
              <Crown className="h-8 w-8 text-brand-foreground" />
            </div>

            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">
              You're out of credits
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your work is safe — nothing was interrupted. Upgrade to keep
              producing cinematic documentaries without limits.
            </p>

            <ul className="mt-6 space-y-3 text-left">
              {PERKS.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5 text-sm"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
                    <p.icon className="h-4 w-4" />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>

            <div className="mt-7 space-y-3">
              <Button asChild variant="brand" size="lg" className="btn-press w-full">
                <Link to="/upgrade" onClick={() => setDismissed(true)}>
                  <Crown className="h-4 w-4" /> Upgrade to Premium
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <button
                onClick={() => {
                  addCredits(10, "Bonus top-up");
                  toast.success("10 bonus credits added");
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-4 w-4" /> Get 10 bonus credits
              </button>

              <button
                onClick={() => setDismissed(true)}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
