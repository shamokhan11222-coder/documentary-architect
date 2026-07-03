import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoMark } from "@/components/Logo";
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error("Enter your email");
    login(email, name);
    toast.success("Account created 🎬");
    router.navigate({ to: "/" });
  }

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-card w-full max-w-md rounded-3xl p-8">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-center font-display text-2xl font-bold tracking-tight">
          Create your studio
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Start producing documentaries with AI
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            type="email"
            placeholder="you@studio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="brand" size="lg" className="w-full">
            Create account
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
