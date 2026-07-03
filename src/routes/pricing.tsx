import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Minus,
  Sparkles,
  ShieldCheck,
  Lock,
  BadgeCheck,
  Building2,
  ArrowRight,
  Zap,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  validateSearch: (search: Record<string, unknown>) => ({
    reason: search.reason === "credits" ? ("credits" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pricing — Stickmax Studio" },
      {
        name: "description",
        content:
          "Simple, credit-based pricing for AI documentary production. Basic, Pro, and Creator plans.",
      },
      { property: "og:title", content: "Pricing — Stickmax Studio" },
      {
        property: "og:description",
        content: "Credit-based plans for AI documentary production.",
      },
    ],
  }),
  component: PricingPage,
});

type Feature = { label: string; value: string | boolean };

type Plan = {
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  highlight: boolean;
  cta: string;
  features: Feature[];
};

const PLANS: Plan[] = [
  {
    name: "Free",
    tagline: "Explore the studio",
    monthly: 0,
    annual: 0,
    highlight: false,
    cta: "Get started",
    features: [
      { label: "Credits", value: "10 one-time" },
      { label: "AI Models", value: "Standard" },
      { label: "Image generations", value: "Standard" },
      { label: "Voice generations", value: false },
      { label: "Video exports", value: false },
      { label: "Commercial license", value: false },
      { label: "API access", value: false },
      { label: "Priority queue", value: false },
      { label: "Team support", value: "Community" },
    ],
  },
  {
    name: "Starter",
    tagline: "For solo creators",
    monthly: 12,
    annual: 9,
    highlight: false,
    cta: "Start Starter",
    features: [
      { label: "Credits", value: "400 / mo" },
      { label: "AI Models", value: "Standard" },
      { label: "Image generations", value: "HD" },
      { label: "Voice generations", value: "Basic" },
      { label: "Video exports", value: "720p" },
      { label: "Commercial license", value: false },
      { label: "API access", value: false },
      { label: "Priority queue", value: false },
      { label: "Team support", value: "Email" },
    ],
  },
  {
    name: "Pro",
    tagline: "For growing channels",
    monthly: 29,
    annual: 23,
    highlight: true,
    cta: "Go Pro",
    features: [
      { label: "Credits", value: "1,200 / mo" },
      { label: "AI Models", value: "Advanced" },
      { label: "Image generations", value: "Ultra HD" },
      { label: "Voice generations", value: "Studio" },
      { label: "Video exports", value: "1080p" },
      { label: "Commercial license", value: true },
      { label: "API access", value: "Standard" },
      { label: "Priority queue", value: true },
      { label: "Team support", value: "Priority" },
    ],
  },
  {
    name: "Creator",
    tagline: "For studios & teams",
    monthly: 59,
    annual: 47,
    highlight: false,
    cta: "Scale as Creator",
    features: [
      { label: "Credits", value: "3,000 / mo" },
      { label: "AI Models", value: "All + Beta" },
      { label: "Image generations", value: "Unlimited*" },
      { label: "Voice generations", value: "Studio+" },
      { label: "Video exports", value: "4K" },
      { label: "Commercial license", value: true },
      { label: "API access", value: "Full" },
      { label: "Priority queue", value: true },
      { label: "Team support", value: "Dedicated" },
    ],
  },
];

const FAQS = [
  {
    q: "What is a credit?",
    a: "Credits power every AI action — research, scripts, images, voice, and exports. Each plan refreshes monthly and unused credits roll into your next cycle on paid plans.",
  },
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrade, downgrade, or cancel whenever you like. Changes are prorated instantly with no lock-in.",
  },
  {
    q: "Do you offer a commercial license?",
    a: "Pro and Creator plans include a full commercial license so you can monetize every documentary you produce.",
  },
  {
    q: "What happens if I run out of credits?",
    a: "You can top up anytime from the Credits page, or upgrade your plan for a larger monthly allowance.",
  },
];

function FeatureRow({ feature }: { feature: Feature }) {
  const enabled = feature.value !== false;
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-sm last:border-0">
      <span className="flex items-center gap-2.5">
        {enabled ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
            <Minus className="h-3.5 w-3.5" />
          </span>
        )}
        <span className={enabled ? "" : "text-muted-foreground/70"}>
          {feature.label}
        </span>
      </span>
      {typeof feature.value === "string" && (
        <span className="text-right text-xs font-semibold text-muted-foreground">
          {feature.value}
        </span>
      )}
    </li>
  );
}

function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="brand-gradient relative min-h-screen overflow-hidden">
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="float absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-brand/25 blur-[120px]" />
        <div className="breathe absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-brand/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-20 md:py-28">
        {/* Hero */}
        <div className="text-center animate-[fade-up_0.6s_var(--ease-out-quint)_both]">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Simple, credit-based pricing
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
            Pricing that scales with your studio
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Produce cinematic AI documentaries end-to-end. Pay for what you
            create — upgrade, downgrade, or cancel any time.
          </p>

          {/* Animated billing switch */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <span
              className={`text-sm font-medium transition-colors ${
                !annual ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setAnnual((v) => !v)}
              className="focus-ring relative h-9 w-16 rounded-full border border-border bg-muted p-1 transition-colors"
              aria-label="Toggle annual billing"
            >
              <span
                className={`block h-7 w-7 rounded-full bg-brand shadow-[var(--shadow-glow)] transition-transform duration-300 ${
                  annual ? "translate-x-7" : "translate-x-0"
                }`}
                style={{ transitionTimingFunction: "var(--ease-spring)" }}
              />
            </button>
            <span
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                annual ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Annual
              <span className="rounded-full bg-brand/12 px-2 py-0.5 text-xs font-semibold text-brand">
                Save 20%
              </span>
            </span>
          </div>

          {/* Money-back guarantee badge */}
          <div className="mt-8 flex justify-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-brand/30 bg-brand/10 px-5 py-2 text-sm font-semibold text-brand shadow-[var(--shadow-glow)] backdrop-blur animate-[float_6s_ease-in-out_infinite]">
              <BadgeCheck className="h-4 w-4" />
              14-day money-back guarantee — no questions asked
            </span>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p, i) => {
            const price = annual ? p.annual : p.monthly;
            return (
              <div
                key={p.name}
                style={{ animationDelay: `${i * 80}ms` }}
                className={`group glass-card relative flex flex-col rounded-3xl p-7 transition-all duration-300 ease-out animate-[spring-in_0.55s_var(--ease-spring)_both] hover:shadow-[var(--shadow-glow)] ${
                  p.highlight
                    ? "ring-2 ring-brand shadow-[var(--shadow-glow)] lg:-translate-y-4 hover:lg:-translate-y-6"
                    : "hover:-translate-y-2"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-foreground shadow-[var(--shadow-glow)] animate-[float_5s_ease-in-out_infinite]">
                    <Zap className="h-3.5 w-3.5" />
                    Most Popular
                  </span>
                )}
                <h3 className="font-display text-xl font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-5xl font-bold tracking-tight">
                    ${price}
                  </span>
                  <span className="pb-1.5 text-sm text-muted-foreground">
                    /mo
                  </span>
                </div>
                <div className="mt-1 h-4 text-xs text-muted-foreground">
                  {annual && p.monthly > 0
                    ? `Billed annually · $${p.annual * 12}/yr`
                    : p.monthly > 0
                      ? "Billed monthly"
                      : "Free forever"}
                </div>
                <Button
                  asChild
                  variant={p.highlight ? "brand" : "outline"}
                  size="lg"
                  className="btn-press mt-6 w-full"
                >
                  <Link to="/signup">{p.cta}</Link>
                </Button>
                <ul className="mt-6 flex-1">
                  {p.features.map((f) => (
                    <FeatureRow key={f.label} feature={f} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Trust badges */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-brand" />
            14-day money-back guarantee
          </span>
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-brand" />
            Secure payments
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Cancel anytime
          </span>
        </div>

        {/* Comparison table */}
        <div className="mt-24">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            Compare every plan
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            A full side-by-side breakdown of what's included in each tier.
          </p>

          <div className="glass-card mt-10 overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="p-5 text-left font-display text-base font-semibold">
                      Features
                    </th>
                    {PLANS.map((p) => (
                      <th
                        key={p.name}
                        className={`p-5 text-center font-display text-base font-semibold ${
                          p.highlight ? "text-brand" : ""
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          {p.name}
                          {p.highlight && (
                            <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-semibold text-brand">
                              Popular
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLANS[0].features.map((row, ri) => (
                    <tr
                      key={row.label}
                      className={`border-b border-border/40 last:border-0 transition-colors hover:bg-brand/5 ${
                        ri % 2 ? "bg-muted/20" : ""
                      }`}
                    >
                      <td className="p-4 pl-5 text-left font-medium text-muted-foreground">
                        {row.label}
                      </td>
                      {PLANS.map((p) => {
                        const val = p.features[ri]?.value;
                        return (
                          <td
                            key={p.name}
                            className={`p-4 text-center ${
                              p.highlight ? "bg-brand/5" : ""
                            }`}
                          >
                            {val === true ? (
                              <Check className="mx-auto h-4 w-4 text-brand" />
                            ) : val === false ? (
                              <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                            ) : (
                              <span className="font-semibold">{val}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Enterprise / Contact sales */}
        <div className="glass-card relative mt-20 overflow-hidden rounded-3xl p-8 md:p-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/20 blur-[100px]" />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                <Building2 className="h-3.5 w-3.5" />
                Enterprise
              </span>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
                Need more credits?
              </h2>
              <p className="mt-3 text-muted-foreground">
                Custom volume pricing, dedicated infrastructure, SSO, and a
                white-glove onboarding team for studios producing at scale.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3">
              <Button size="lg" variant="brand" className="btn-press">
                <a href="mailto:sales@stickmax.io" className="flex items-center gap-2">
                  Contact Sales
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="btn-press">
                <Link to="/credits">Buy more credits</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-24">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
            {FAQS.map((f) => (
              <div
                key={f.q}
                className="glass-card rounded-2xl p-6 text-left"
              >
                <h3 className="font-display text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Still have questions?{" "}
            <Link to="/faq" className="font-medium text-brand hover:underline">
              Read the full FAQ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
