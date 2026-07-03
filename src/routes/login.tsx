import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { login } from "@/lib/account";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in — Stickmax Studio" }] }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [success, setSuccess] = useState(false);

  function finish(msg: string) {
    setSuccess(true);
    toast.success(msg);
    setTimeout(() => router.navigate({ to: "/" }), 1100);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error("Enter your email");
    login(email);
    finish("Welcome back 👋");
  }

  function social(p: "google" | "github") {
    login(`${p}-user@stickmax.io`, p === "google" ? "Google User" : "GitHub User");
    finish(`Signed in with ${p === "google" ? "Google" : "GitHub"}`);
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your Stickmax Studio"
      success={success}
      successText="Welcome back!"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      <SocialButtons onProvider={social} />

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>

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
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={show ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-brand"
            />
            Remember me
          </label>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="brand" size="lg" className="btn-press w-full">
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}
