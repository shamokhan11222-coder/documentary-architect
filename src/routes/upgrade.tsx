import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Check,
  X,
  Sparkles,
  Zap,
  Crown,
  ArrowRight,
  ShieldCheck,
  Rocket,
  Wand2,
  Infinity as InfinityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCredits,
  useAccount,
  addCredits,
  DEFAULT_CREDITS,
} from "@/lib/account";
import { toast } from "sonner";

export const Route = createFileRoute("/upgrade")({
  head: () => ({
    meta: [
      { title: "Upgrade to Premium — Stickmax Studio" },
      {
        name: "description",
        content:
          "You've used all your free credits. Upgrade to keep producing cinematic AI documentaries without limits.",
      },
    ],
  }),
  component: UpgradePage,
});

const WHY = [
  {
    icon: Rocket,
    title: "Unlimited production",
    body: "Generate research, scripts, storyboards, voice, and exports without hitting a wall.",
  },
  {
    icon: Wand2,
    title: "Premium AI models",
    body: "Access advanced models, Ultra-HD images, and studio-grade voice generation.",
  },
  {
    icon: ShieldCheck,
    title: "Commercial license",
    body: "Monetize every documentary you produce with a full commercial license.",
  },
  {
    icon: Zap,
    title: "Priority queue",
    body: "Skip the line — your generations run first, even during peak hours.",
  },
];

const COMPARE: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: "Monthly credits", free: "10 one-time", pro: "1,200 / mo" },
  { label: "AI models", free: "Standard", pro: "Advanced" },
  { label: "Image quality", free: "Standard", pro: "Ultra HD" },
  { label: "Voice studio", free: false, pro: true },
  { label: "Video exports", free: false, pro: "1080p" },
  { label: "Commercial license", free: false, pro: true },
  { label: "Priority queue", free: false, pro: true },
  { label: "Support", free: "Community", pro: "Priority" },
];

const PLANS = [
  {
    name: "Starter",
    price: 12,
    credits: "400",
    icon: Sparkles,
    highlight: false,
  },
  {
    name: "Pro",
    price: 29,
    credits: "1,200",
    icon: Crown,
    highlight: true,
  },
  {
    name: "Creator",
    price: 59,
    credits: "3,000",
    icon: InfinityIcon,
    highlight: false,
  },
];

function ProgressRing({ used, total }: { used: number; total: number }) {
  const pct = Math.min(1, total === 0 ? 1 : used / total);
  const size = 180;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="color-mix(in oklab, var(--muted-foreground) 20%, transparent)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{
            transition: "stroke-dashoffset 1s var(--ease-out-quint)",
            filter: "drop-shadow(0 0 10px color-mix(in oklab, var(--brand) 55%, transparent))",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold">
          {used} / {total}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          credits used
        </span>
      </div>
    </div>
  );
}

function UpgradePage() {
  const router = useRouter();
  const { balance, history } = useCredits();
  const account = useAccount();
  const spent = history
    .filter((h) => h.amount < 0)
    .reduce((s, h) => s + Math.abs(h.amount), 0);
  const total = Math.max(DEFAULT_CREDITS, spent + balance);
  const used = total - balance;
  const planName = (account?.plan ?? "free").replace(/\b\w/g, (c) => c.toUpperCase());

  function continueFree() {
    // Grant the daily free allowance and head back into the studio.
    addCredits(DEFAULT_CREDITS, "Daily free credits");
    toast.success("Your free credits are back — welcome back!");
    router.navigate({ to: "/topics" });
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient background */}
      <div className="animated-gradient pointer-events-none absolute inset-0" />
      {/* Floating shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="float absolute -top-20 left-[12%] h-72 w-72 rounded-full bg-brand/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-brand/20 blur-[130px]" style={{ animation: "float 7s ease-in-out infinite" }} />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-brand/15 blur-[120px]" style={{ animation: "float 9s ease-in-out infinite" }} />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-16 md:py-24">
        {/* Hero */}
        <div className="flex flex-col items-center text-center animate-[fade-up_0.6s_var(--ease-out-quint)_both]">
          <div className="float relative mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-brand/12 backdrop-blur">
            <Rocket className="h-14 w-14 text-brand" />
            <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
            <Zap className="h-3.5 w-3.5" />
            Time to level up
          </span>
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
            You've used all your free credits.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Upgrade to keep producing cinematic AI documentaries — no limits, no
            waiting.
          </p>
        </div>

        {/* Status: ring + stats */}
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <div className="glass-card flex items-center justify-center rounded-3xl p-8 animate-[spring-in_0.55s_var(--ease-spring)_both]">
            <ProgressRing used={used} total={total} />
          </div>
          <div className="glass-card flex flex-col justify-center rounded-3xl p-8 animate-[spring-in_0.55s_var(--ease-spring)_both]" style={{ animationDelay: "80ms" }}>
            <span className="text-sm text-muted-foreground">Current plan</span>
            <span className="mt-1 font-display text-3xl font-bold">{planName}</span>
            <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> Free tier
            </span>
          </div>
          <div className="glass-card flex flex-col justify-center rounded-3xl p-8 animate-[spring-in_0.55s_var(--ease-spring)_both]" style={{ animationDelay: "160ms" }}>
            <span className="text-sm text-muted-foreground">Credits remaining</span>
            <span className="mt-1 font-display text-5xl font-bold text-brand">{balance}</span>
            <span className="mt-2 text-xs text-muted-foreground">Resets daily on the Free plan</span>
          </div>
        </div>

        {/* Why upgrade */}
        <div className="mt-20">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            Why upgrade?
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {WHY.map((w) => (
              <div key={w.title} className="glass-card card-lift rounded-2xl p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
                  <w.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{w.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison table */}
        <div className="mt-20">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            Free vs Pro
          </h2>
          <div className="glass-card mt-8 overflow-hidden rounded-3xl">
            <div className="grid grid-cols-3 border-b border-border/60 bg-brand/5 px-6 py-4 text-sm font-semibold">
              <span className="text-muted-foreground">Feature</span>
              <span className="text-center">Free</span>
              <span className="text-center text-brand">Pro</span>
            </div>
            {COMPARE.map((row) => (
              <div key={row.label} className="grid grid-cols-3 items-center border-b border-border/40 px-6 py-3.5 text-sm last:border-0">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-center">{renderCell(row.free)}</span>
                <span className="text-center font-medium">{renderCell(row.pro, true)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing cards */}
        <div className="mt-20">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            Choose your plan
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {PLANS.map((p, i) => (
              <div
                key={p.name}
                style={{ animationDelay: `${i * 80}ms` }}
                className={`glass-card relative flex flex-col rounded-3xl p-7 animate-[spring-in_0.55s_var(--ease-spring)_both] ${
                  p.highlight ? "ring-2 ring-brand shadow-[var(--shadow-glow)] sm:-translate-y-3" : ""
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-foreground shadow-[var(--shadow-glow)] animate-[float_5s_ease-in-out_infinite]">
                    <Zap className="h-3.5 w-3.5" /> Most Popular
                  </span>
                )}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold">{p.name}</h3>
                <div className="mt-2 flex items-end gap-1">
                  <span className="text-4xl font-bold tracking-tight">${p.price}</span>
                  <span className="pb-1 text-sm text-muted-foreground">/mo</span>
                </div>
                <div className="mt-1 text-sm font-medium text-brand">{p.credits} credits / mo</div>
                <Button asChild variant={p.highlight ? "brand" : "outline"} size="lg" className="btn-press mt-6 w-full">
                  <Link to="/signup">Upgrade to {p.name}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="outline" size="lg" className="btn-press w-full sm:w-auto" onClick={continueFree}>
            Continue with Free tomorrow
          </Button>
          <Button asChild variant="brand" size="lg" className="btn-press w-full sm:w-auto">
            <Link to="/pricing" className="flex items-center gap-2">
              Upgrade Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          14-day money-back guarantee · Secure payments · Cancel anytime
        </p>
      </div>
    </div>
  );
}

function renderCell(value: string | boolean, brand = false) {
  if (value === true)
    return (
      <Check className={`mx-auto h-5 w-5 ${brand ? "text-brand" : "text-foreground"}`} />
    );
  if (value === false)
    return <X className="mx-auto h-5 w-5 text-muted-foreground/50" />;
  return <span className={brand ? "text-brand" : ""}>{value}</span>;
}
