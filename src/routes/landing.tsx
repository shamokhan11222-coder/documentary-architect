import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  Search,
  BookText,
  Image as ImageIcon,
  Mic,
  BarChart3,
  ArrowRight,
  Check,
  Star,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import {
  Reveal,
  RevealBlur,
  RevealScale,
  Stagger,
  Floating,
  AnimatedNumber,
} from "@/components/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import hero1 from "@/assets/hero-1.jpg";
import hero2 from "@/assets/hero-2.jpg";
import hero3 from "@/assets/hero-3.jpg";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "Stickmax Studio — AI Documentary Production" },
      {
        name: "description",
        content:
          "Stickmax Studio is the AI command center for USA documentary YouTube channels: topics, research, story, images, voice, SEO and export in one flow.",
      },
      { property: "og:title", content: "Stickmax Studio — AI Documentary Production" },
      {
        property: "og:description",
        content: "The AI command center for documentary YouTube channels.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: Sparkles, title: "Topic Engine", desc: "Senior-strategist topics that make viewers say “I never thought about that.”" },
  { icon: Search, title: "Research Engine", desc: "Deep, structured research and story angles in seconds." },
  { icon: BookText, title: "Story & Script", desc: "8–12 minute documentary scripts built for retention." },
  { icon: ImageIcon, title: "Images & Thumbnails", desc: "Consistent storyboards and high-CTR thumbnail concepts." },
  { icon: Mic, title: "Voice Studio", desc: "Narration and subtitles ready for the timeline." },
  { icon: BarChart3, title: "SEO & Rating", desc: "Titles, descriptions and a quality score before you publish." },
];

const STATS = [
  { value: 40000, suffix: "+", label: "Assets generated" },
  { value: 1200, suffix: "+", label: "Creators onboard" },
  { value: 6, suffix: "×", label: "Faster production" },
  { value: 98, suffix: "%", label: "Would recommend" },
];

const TRUSTED = ["NorthPoint", "Archivia", "Everyday Origins", "Blue Lantern", "Verite", "Kindling"];

const TESTIMONIALS = [
  {
    quote:
      "Stickmax replaced a 4-person pipeline. I go from a raw idea to a finished, exportable documentary in an afternoon.",
    name: "Maya R.",
    role: "History channel · 480K subs",
  },
  {
    quote:
      "The topic engine alone is worth it. Every idea feels like a thumbnail I want to click.",
    name: "Devin K.",
    role: "Documentary creator · 210K subs",
  },
  {
    quote:
      "Research, script, voice, thumbnails — one flow. My upload schedule finally feels sustainable.",
    name: "Sofia L.",
    role: "Explainer studio · 1.1M subs",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    tagline: "Explore the studio",
    features: ["10 credits", "Standard AI models", "Standard images", "Community support"],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$23",
    tagline: "For growing channels",
    features: ["1,200 credits / mo", "Advanced AI models", "Ultra-HD images", "1080p exports", "Priority queue"],
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Creator",
    price: "$47",
    tagline: "For studios & teams",
    features: ["3,000 credits / mo", "All + beta models", "4K exports", "Full API access", "Dedicated support"],
    cta: "Scale up",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "What exactly does Stickmax Studio do?",
    a: "It runs the entire documentary pipeline — topic ideation, research, scripting, images, thumbnails, voice, SEO and export — in one connected flow.",
  },
  {
    q: "Do I need any editing experience?",
    a: "No. Each stage produces production-ready output. You stay in control, approving and refining as you go.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Plans are month-to-month with a 14-day money-back guarantee. No lock-in.",
  },
  {
    q: "Who owns the content I create?",
    a: "You do. Paid plans include a commercial license for everything you generate.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate animated-gradient">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-20 md:grid-cols-[1.05fr_0.95fr] md:pt-28">
          <RevealBlur>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> AI documentary production
            </span>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,6vw,4.5rem)] font-bold leading-[1.02] tracking-tight">
              Your entire <span className="text-brand">documentary studio</span>, powered by AI
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              From a curiosity-driven topic to a finished, exportable video — Stickmax Studio runs
              the whole pipeline so you can publish more, faster.
            </p>
            {/* Glass CTA */}
            <div className="glass-card glass-sheen mt-8 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
              <Button asChild variant="brand" size="lg" className="btn-press flex-1">
                <Link to="/signup">Start creating free <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="btn-press flex-1">
                <Link to="/pricing">View pricing</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              No credit card required · 14-day money-back guarantee
            </p>
          </RevealBlur>

          {/* Floating AI images */}
          <div className="relative h-[420px] md:h-[500px]">
            <Floating className="absolute left-0 top-6 w-[46%]">
              <img src={hero1} alt="AI documentary still" width={768} height={1024}
                className="glass-card rounded-2xl object-cover shadow-float" />
            </Floating>
            <Floating className="absolute right-0 top-0 w-[50%] [animation-delay:1.2s]">
              <img src={hero3} alt="AI cinematic aerial" width={768} height={1024}
                className="glass-card rounded-2xl object-cover shadow-float" />
            </Floating>
            <Floating className="absolute bottom-0 left-1/2 w-[52%] -translate-x-1/3 [animation-delay:0.6s]">
              <img src={hero2} alt="AI cinematic lighting" width={768} height={1024}
                className="glass-card rounded-2xl object-cover shadow-float" />
            </Floating>
          </div>
        </div>

        {/* Social proof strip */}
        <div className="mx-auto max-w-6xl px-6 pb-16">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Trusted by documentary creators worldwide
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
              {TRUSTED.map((name) => (
                <span key={name} className="font-display text-lg font-bold tracking-tight text-foreground/80">
                  {name}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Stats ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Stagger className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="glass-card rounded-2xl p-6 text-center">
              <div className="font-display text-3xl font-bold text-brand md:text-4xl">
                <AnimatedNumber value={s.value} />{s.suffix}
              </div>
              <div className="mt-1.5 text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ---------------- Alternating feature rows ---------------- */}
      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16">
        <FeatureRow
          image={hero1}
          eyebrow="Ideation"
          title="Ideas that stop the scroll"
          desc="The Topic Engine thinks like a senior documentary strategist — surfacing curiosity-driven angles about the hidden origins of everyday life, and auto-rejecting anything generic."
          points={["Senior-strategist prompts", "Auto-rejects weak ideas", "Trains to your taste"]}
          icon={Sparkles}
        />
        <FeatureRow
          image={hero2}
          reverse
          eyebrow="Story"
          title="Research and scripts, retention-ready"
          desc="Deep structured research feeds an 8–12 minute script engineered for watch-time — hooks, beats and payoffs already in place."
          points={["Structured research in seconds", "Retention-first scripting", "Editable at every step"]}
          icon={BookText}
        />
        <FeatureRow
          image={hero3}
          eyebrow="Production"
          title="Visuals, voice and export in one flow"
          desc="Consistent storyboards, high-CTR thumbnails, natural narration and clean SEO — then export straight to your timeline."
          points={["Consistent image sets", "High-CTR thumbnails", "Voice + SEO + export"]}
          icon={ImageIcon}
        />
      </section>

      {/* ---------------- Feature cards ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <h2 className="text-center font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
            One flow, end to end
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted-foreground">
            Every stage of production, connected — so nothing gets lost between tools.
          </p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card glass-sheen rounded-2xl p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ---------------- Testimonials ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Stagger className="grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="glass-card flex flex-col rounded-2xl p-6">
              <div className="flex gap-0.5 text-brand">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-brand" />
                ))}
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">“{t.quote}”</p>
              <div className="mt-5">
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </div>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ---------------- Pricing ---------------- */}
      <section className="brand-gradient">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="text-center font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
              Beautiful pricing that scales
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted-foreground">
              Start free. Upgrade only when you're producing at scale.
            </p>
          </Reveal>
          <Stagger className="mt-12 grid items-stretch gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-3xl p-7 ${
                  p.highlight
                    ? "glass-card border-2 border-brand/60 shadow-float"
                    : "glass-card"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground shadow-soft">
                    Most popular
                  </span>
                )}
                <div className="font-display text-lg font-bold">{p.name}</div>
                <div className="text-sm text-muted-foreground">{p.tagline}</div>
                <div className="mt-4 font-display text-4xl font-bold">
                  {p.price}
                  <span className="text-base font-medium text-muted-foreground">/mo</span>
                </div>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 shrink-0 text-brand" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={p.highlight ? "brand" : "outline"}
                  size="lg"
                  className="btn-press mt-7"
                >
                  <Link to="/pricing">{p.cta}</Link>
                </Button>
              </div>
            ))}
          </Stagger>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /> 14-day money-back</span>
            <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-brand" /> Cancel anytime</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-brand" /> Secure payments</span>
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Reveal>
          <h2 className="text-center font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
            Frequently asked questions
          </h2>
        </Reveal>
        <RevealScale className="mt-10">
          <Accordion type="single" collapsible className="glass-card rounded-2xl px-5">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className="border-border/50">
                <AccordionTrigger className="text-left font-display text-base font-semibold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </RevealScale>
      </section>

      {/* ---------------- Final CTA ---------------- */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <RevealScale>
          <div className="glass-card glass-sheen relative overflow-hidden rounded-[2rem] p-12 text-center md:p-16">
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
              Ready to build your next documentary?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Join creators using Stickmax Studio to research, write and produce faster.
            </p>
            <Button asChild variant="brand" size="lg" className="btn-press mt-8">
              <Link to="/signup">Get started free <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </RevealScale>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-border/60 glass">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8" />
              <span className="font-display text-lg font-bold">Stickmax <span className="text-brand">Studio</span></span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              The AI command center for documentary YouTube channels.
            </p>
          </div>
          <FooterCol title="Product" links={[["Features", "/landing"], ["Pricing", "/pricing"], ["Docs", "/docs"], ["Roadmap", "/roadmap"]]} />
          <FooterCol title="Company" links={[["Community", "/community"], ["FAQ", "/faq"]]} />
          <FooterCol title="Get started" links={[["Log in", "/login"], ["Sign up", "/signup"], ["Dashboard", "/"]]} />
        </div>
        <div className="border-t border-border/50">
          <div className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Stickmax Studio. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({
  image,
  eyebrow,
  title,
  desc,
  points,
  icon: Icon,
  reverse,
}: {
  image: string;
  eyebrow: string;
  title: string;
  desc: string;
  points: string[];
  icon: typeof Sparkles;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <RevealBlur className={reverse ? "md:order-2" : ""}>
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
          <Icon className="h-3.5 w-3.5" /> {eyebrow}
        </span>
        <h3 className="mt-4 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-bold tracking-tight">{title}</h3>
        <p className="mt-4 text-lg text-muted-foreground">{desc}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-sm font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/12 text-brand">
                <Check className="h-3 w-3" />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </RevealBlur>
      <RevealScale className={reverse ? "md:order-1" : ""}>
        <div className="glass-card glass-sheen overflow-hidden rounded-3xl p-2">
          <img
            src={image}
            alt={title}
            loading="lazy"
            width={768}
            height={1024}
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
        </div>
      </RevealScale>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, to]) => (
          <li key={label}>
            <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-brand">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
