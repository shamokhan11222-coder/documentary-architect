import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { PasswordStrength, scorePassword } from "@/components/auth/PasswordStrength";
import { login } from "@/lib/account";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Stickmax Studio" }] }),
  component: SignupPage,
});

function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [success, setSuccess] = useState(false);

  function finish(msg: string) {
    setSuccess(true);
    toast.success(msg);
    setTimeout(() => router.navigate({ to: "/" }), 1100);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error("Enter your email");
    if (password && scorePassword(password) < 2) {
      return toast.error("Please choose a stronger password");
    }
    login(email, name);
    finish("Account created 🎬");
  }

  function social(p: "google" | "github") {
    login(`${p}-user@stickmax.io`, p === "google" ? "Google User" : "GitHub User");
    finish(`Signed up with ${p === "google" ? "Google" : "GitHub"}`);
  }

  return (
    <AuthShell
      title="Create your studio"
      subtitle="Start producing documentaries with AI"
      success={success}
      successText="Studio ready!"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </p>
      }
    >
      <SocialButtons onProvider={social} />

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or sign up with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="pl-10"
          />
        </div>
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
        <div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type={show ? "text" : "password"}
              placeholder="Create a password"
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
          <div className="mt-2">
            <PasswordStrength password={password} />
          </div>
        </div>

        <Button type="submit" variant="brand" size="lg" className="btn-press w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
