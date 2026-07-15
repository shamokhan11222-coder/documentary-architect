import { useEffect } from "react";
import { ensureRenewal } from "@/lib/account";

// Phase 5 — owner-operated studio. The old paywall / pricing redirect is
// removed. This component now only ensures the monthly credit renewal tick
// still runs; it never navigates the user to a customer marketing page.
export function CreditGate() {
  useEffect(() => {
    ensureRenewal();
  }, []);
  return null;
}
