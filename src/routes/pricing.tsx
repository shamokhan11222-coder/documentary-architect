import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
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

const PLANS = [
  {
    name: "Basic",
    price: 12,
    credits: 400,
    highlight: false,
    cta: "Start Basic",
    features: [
      "400 credits / month",
      "Topic + Research engine",
      "Story & script generation",
      "Standard image quality",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: 29,
    credits: 1200,
    highlight: true,
    cta: "Go Pro",
    features: [
      "1,200 credits / month",
      "Everything in Basic",
      "HD thumbnails & storyboards",
      "Voice studio + subtitles",
      "SEO + rating engine",
      "Priority generation",
    ],
  },
  {
    name: "Creator",
    price: 59,
    credits: 3000,
    highlight: false,
    cta: "Scale as Creator",
    features: [
      "3,000 credits / month",
      "Everything in Pro",
      "Bulk auto-generation",
      "Visual DNA consistency",
      "Export pipeline",
      "Dedicated support",
    ],
  },
];

function PricingPage() {
  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Pricing that scales with your channel
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Pay for what you create with credits. Upgrade any time — no lock-in.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`glass-card relative flex flex-col rounded-3xl p-7 ${
                p.highlight ? "ring-2 ring-brand" : ""
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-bold tracking-tight">${p.price}</span>
                <span className="pb-1 text-sm text-muted-foreground">/month</span>
              </div>
              <div className="mt-1 text-sm font-medium text-brand">
                {p.credits.toLocaleString()} credits included
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={p.highlight ? "brand" : "outline"}
                size="lg"
                className="mt-7 w-full"
              >
                <Link to="/signup">{p.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Have questions?{" "}
          <Link to="/faq" className="font-medium text-brand hover:underline">
            Read the FAQs
          </Link>
        </p>
      </div>
    </div>
  );
}
