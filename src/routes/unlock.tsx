import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock } from "lucide-react";

import { getGateStatus, unlockSite } from "@/lib/gate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/unlock")({
  head: () => ({ meta: [{ title: "Private Access — DOCU OS" }] }),
  loader: async () => {
    const status = await getGateStatus();
    // If the gate is off or already unlocked, no reason to show this page.
    if (!status.enabled || status.unlocked) throw redirect({ to: "/" });
    return status;
  },
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const { ok } = await unlock({ data: { password } });
      if (ok) {
        await router.invalidate();
        await router.navigate({ to: "/" });
      } else {
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          <h1 className="text-lg font-semibold">DOCU OS</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          This is a private workspace. Enter the access password to continue.
        </p>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
          className="mt-4"
        />
        {error && (
          <p className="mt-2 text-sm text-destructive">Incorrect password.</p>
        )}
        <Button type="submit" className="mt-4 w-full" disabled={busy || !password}>
          {busy ? "Unlocking…" : "Enter"}
        </Button>
      </form>
    </div>
  );
}
