import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Stickmax Studio" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error("Enter your email");
    setSent(true);
    toast.success("Reset link sent");
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a secure reset link"
      footer={
        <Link
          to="/login"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center animate-[fade-up_0.4s_ease-out_both]">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/12 animate-[success-pop_0.5s_var(--ease-spring)_both]">
            <MailCheck className="h-8 w-8 text-brand" />
          </div>
          <div>
            <p className="font-display text-base font-semibold">Check your inbox</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a reset link to <span className="text-foreground">{email}</span>
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="brand" size="lg" className="btn-press w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
