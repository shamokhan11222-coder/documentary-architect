import { createFileRoute } from "@tanstack/react-router";
import { Coins, TrendingUp, AlertTriangle, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useCredits,
  addCredits,
  FULL_RUN_ESTIMATE,
  LOW_CREDIT_THRESHOLD,
  CREDIT_COSTS,
} from "@/lib/account";

export const Route = createFileRoute("/credits")({
  head: () => ({ meta: [{ title: "Credits — Stickmax Studio" }] }),
  component: CreditsPage,
});

function CreditsPage() {
  const { balance, history } = useCredits();
  const low = balance <= LOW_CREDIT_THRESHOLD;
  const spent = history
    .filter((h) => h.amount < 0)
    .reduce((s, h) => s + Math.abs(h.amount), 0);

  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Credits</h1>
        <p className="mt-1 text-muted-foreground">
          Track your balance, usage, and estimated cost before you generate.
        </p>

        {low && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              Low credit balance. Top up to keep generating documentaries without interruption.
            </span>
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <Card className="glass-card p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4 text-brand" /> Credits remaining
            </div>
            <div
              className={`mt-2 text-4xl font-bold tracking-tight ${
                low ? "text-destructive" : "text-foreground"
              }`}
            >
              {balance}
            </div>
          </Card>
          <Card className="glass-card p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-brand" /> Total spent
            </div>
            <div className="mt-2 text-4xl font-bold tracking-tight">{spent}</div>
          </Card>
          <Card className="glass-card p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-brand" /> Full documentary est.
            </div>
            <div className="mt-2 text-4xl font-bold tracking-tight">~{FULL_RUN_ESTIMATE}</div>
            <div className="mt-1 text-xs text-muted-foreground">credits per auto-generation</div>
          </Card>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Card className="glass-card p-6">
            <h2 className="font-display text-lg font-bold">Estimated cost per action</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {Object.entries(CREDIT_COSTS).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                  <span className="capitalize text-muted-foreground">{k}</span>
                  <span className="font-medium">{v} credits</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="glass-card flex flex-col p-6">
            <h2 className="font-display text-lg font-bold">Buy credits</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Top-up packs (billing coming soon — this adds credits locally for now).
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[200, 500, 1200].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  onClick={() => {
                    addCredits(amt, `Bought ${amt} credits`);
                    toast.success(`Added ${amt} credits`);
                  }}
                >
                  +{amt}
                </Button>
              ))}
            </div>
            <Button variant="brand" size="lg" className="mt-auto pt-0">
              <Plus className="h-4 w-4" /> Buy credits
            </Button>
          </Card>
        </div>

        <Card className="glass-card mt-6 p-6">
          <h2 className="font-display text-lg font-bold">Usage history</h2>
          <div className="mt-4 space-y-2">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between border-b border-border/50 pb-2 text-sm last:border-0"
              >
                <div>
                  <div className="font-medium">{h.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.at).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`font-semibold ${
                    h.amount < 0 ? "text-destructive" : "text-brand"
                  }`}
                >
                  {h.amount > 0 ? "+" : ""}
                  {h.amount}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
