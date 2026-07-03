import { useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import {
  useCredits,
  useHasUnlimitedAccess,
  ensureRenewal,
} from "@/lib/account";

// Pages where we never intercept (the pricing/upgrade flow itself).
const HIDDEN_ON = ["/upgrade", "/credits", "/pricing"];

/**
 * When credits run out we never show a popup. Instead we play a smooth
 * full-screen blur transition and glide the user to the pricing page, where
 * they can be convinced to upgrade in context.
 */
export function CreditGate() {
  const { balance } = useCredits();
  const unlimited = useHasUnlimitedAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const [transitioning, setTransitioning] = useState(false);
  const firedRef = useRef(false);

  // Grant the monthly free allowance when a renewal is due.
  useEffect(() => {
    ensureRenewal();
  }, []);

  const needsUpgrade =
    !unlimited && balance <= 0 && !HIDDEN_ON.includes(pathname);

  // Smoothly blur-fade the current view, then navigate to pricing.
  useEffect(() => {
    if (!needsUpgrade) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    setTransitioning(true);
    const nav = setTimeout(() => {
      router.navigate({ to: "/pricing", search: { reason: "credits" } });
      const clear = setTimeout(() => setTransitioning(false), 500);
      return () => clearTimeout(clear);
    }, 700);
    return () => clearTimeout(nav);
  }, [needsUpgrade, router]);

  // Let other views summon the same smooth transition on demand.
  useEffect(() => {
    const open = () => {
      setTransitioning(true);
      setTimeout(() => {
        router.navigate({ to: "/pricing", search: { reason: "credits" } });
        setTimeout(() => setTransitioning(false), 500);
      }, 400);
    };
    window.addEventListener("open-credit-gate", open);
    return () => window.removeEventListener("open-credit-gate", open);
  }, [router]);

  if (!transitioning) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-2xl animate-fade-in" />
      <div className="relative flex flex-col items-center gap-4 animate-scale-in">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand to-cyan shadow-[var(--shadow-glow)] animate-float">
          <Sparkles className="h-8 w-8 text-brand-foreground" />
        </div>
        <p className="font-display text-lg font-semibold tracking-tight">
          Unlocking more creating power…
        </p>
      </div>
    </div>
  );
}
