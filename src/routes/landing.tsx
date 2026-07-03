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
  Play,
  Wand2,
  MessagesSquare,
  Github,
  Twitter,
  Youtube,
  Users,
  Film,
  Clapperboard,
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
  Typewriter,
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

const DEMO_STEPS = [
  { label: "Topic", text: "The forgotten engineer who wired the first city — and why history erased him." },
  { label: "Research", text: "12 sourced beats · timeline · 3 contrarian angles · retention hooks mapped." },
  { label: "Script", text: "Cold open → rising tension → payoff. An 11-minute cut built for watch-time." },
  { label: "Visuals", text: "Consistent storyboard, cinematic thumbnails and narration — export-ready." },
];

const VIDEOS = [
  { img: hero1, title: "The Hidden Origins of the Traffic Light", meta: "11:42 · 1.2M views" },
  { img: hero3, title: "Who Really Invented the Escalator?", meta: "9:18 · 840K views" },
  { img: hero2, title: "The City That Ran on Steam", meta: "13:05 · 2.1M views" },
];

const COMMUNITY = [
  { icon: MessagesSquare, title: "Creator Discord", desc: "8,000+ documentary makers sharing hooks, prompts and workflows.", stat: "8k members" },
  { icon: Wand2, title: "Prompt Library", desc: "Battle-tested topic and script recipes, added weekly.", stat: "300+ recipes" },
  { icon: Users, title: "Live Workshops", desc: "Weekly teardown sessions with 7-figure channel owners.", stat: "Every Friday" },
];

const SOCIALS = [
  { icon: Twitter, label: "Twitter" },
  { icon: Youtube, label: "YouTube" },
  { icon: Github, label: "GitHub" },
  { icon: MessagesSquare, label: "Discord" },
];

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate animated-gradient">
        {/* Animated background orbs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="breathe absolute -left-32 top-10 h-96 w-96 rounded-full bg-brand/25 blur-[120px]" />
          <div className="breathe absolute -right-24 top-40 h-[28rem] w-[28rem] rounded-full bg-cyan/20 blur-[130px] [animation-delay:2s]" />
          <div className="breathe absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-brand/20 blur-[120px] [animation-delay:4s]" />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-20 md:grid-cols-[1.05fr_0.95fr] md:pt-28">
          <RevealBlur>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> AI documentary production
            </span>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,6vw,4.5rem)] font-bold leading-[1.02] tracking-tight">
              Your entire{" "}
              <span className="bg-gradient-to-r from-brand via-cyan to-brand bg-clip-text text-transparent">
                documentary studio
              </span>
              , powered by AI
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
              <div className="glass-card overflow-hidden rounded-2xl shadow-float">
                <img src={hero1} alt="AI documentary still" width={768} height={1024}
                  className="ken-burns object-cover" />
              </div>
            </Floating>
            <Floating className="absolute right-0 top-0 w-[50%] [animation-delay:1.2s]">
              <div className="glass-card overflow-hidden rounded-2xl shadow-float">
                <img src={hero3} alt="AI cinematic aerial" width={768} height={1024}
                  className="ken-burns object-cover [animation-delay:3s]" />
              </div>
            </Floating>
            <Floating className="absolute bottom-0 left-1/2 w-[52%] -translate-x-1/3 [animation-delay:0.6s]">
              <div className="glass-card overflow-hidden rounded-2xl shadow-float">
                <img src={hero2} alt="AI cinematic lighting" width={768} height={1024}
                  className="ken-burns object-cover [animation-delay:6s]" />
              </div>
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

      {/* ---------------- AI Demo ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
              <Wand2 className="h-3.5 w-3.5" /> See it in action
            </span>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
              One idea in. A whole documentary out.
            </h2>
          </div>
        </Reveal>
        <RevealScale className="mt-12">
          <div className="glass-card glass-sheen relative overflow-hidden rounded-[2rem] p-6 md:p-10">
            {/* prompt bar */}
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/50 px-5 py-4">
              <Sparkles className="h-5 w-5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 text-sm md:text-base">
                <Typewriter text="Make a documentary about the hidden origins of everyday objects…" />
              </div>
              <span className="hidden shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground sm:inline-flex">
                Generate
              </span>
            </div>
            {/* pipeline output */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_STEPS.map((step, i) => (
                <div
                  key={step.label}
                  className="glass-panel flex flex-col gap-2 rounded-2xl p-5 animate-spring-in"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand/15 text-[11px]">{i + 1}</span>
                    {step.label}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/85">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </RevealScale>
      </section>

      {/* ---------------- Alternating feature showcase ---------------- */}
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
            <div key={f.title} className="card-lift glass-card glass-sheen rounded-2xl p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ---------------- Video showcase ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
              <Clapperboard className="h-3.5 w-3.5" /> Made with Stickmax
            </span>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
              Documentaries people actually watch
            </h2>
          </div>
        </Reveal>
        <Stagger className="mt-12 grid gap-6 md:grid-cols-3">
          {VIDEOS.map((v) => (
            <div key={v.title} className="card-lift glass-card group overflow-hidden rounded-3xl">
              <div className="relative aspect-video overflow-hidden">
                <img src={v.img} alt={v.title} loading="lazy" width={768} height={432}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-background/70 text-brand backdrop-blur transition-transform duration-300 group-hover:scale-110">
                    <Play className="h-7 w-7 fill-brand" />
                  </span>
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-display text-base font-bold leading-snug">{v.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Film className="h-3.5 w-3.5" /> {v.meta}
                </p>
              </div>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ---------------- Testimonials ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <h2 className="text-center font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
            Loved by serious creators
          </h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card-lift glass-card flex flex-col rounded-2xl p-6">
              <div className="flex gap-0.5 text-brand">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-brand" />
                ))}
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">“{t.quote}”</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/15 font-display text-sm font-bold text-brand">
                  {t.name.charAt(0)}
                </span>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ---------------- Community ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
              <Users className="h-3.5 w-3.5" /> Community
            </span>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-bold tracking-tight">
              You're not creating alone
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Join a movement of documentary makers pushing storytelling forward together.
            </p>
          </div>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {COMMUNITY.map((c) => (
            <div key={c.title} className="card-lift glass-card flex flex-col gap-3 rounded-3xl p-7">
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <c.icon className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">{c.stat}</span>
              </div>
              <h3 className="mt-1 font-display text-lg font-bold">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </Stagger>
        <Reveal className="mt-8 text-center">
          <Button asChild variant="brand" size="lg" className="btn-press">
            <Link to="/community"><MessagesSquare className="h-4 w-4" /> Join the community</Link>
          </Button>
        </Reveal>
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
                className={`card-lift relative flex flex-col rounded-3xl p-7 ${
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
            <div aria-hidden className="breathe pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/25 blur-[100px]" />
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
              <span className="font-display text-lg font-bold">Stickmax</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              The AI command center for documentary YouTube channels.
            </p>
            <div className="mt-5 flex gap-2">
              {SOCIALS.map((s) => (
                <span
                  key={s.label}
                  aria-label={s.label}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-card/40 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
                >
                  <s.icon className="h-4 w-4" />
                </span>
              ))}
            </div>
          </div>
          <FooterCol title="Product" links={[["Features", "/landing"], ["Pricing", "/pricing"], ["Docs", "/docs"], ["Roadmap", "/roadmap"]]} />
          <FooterCol title="Company" links={[["Community", "/community"], ["FAQ", "/faq"]]} />
          <FooterCol title="Get started" links={[["Log in", "/login"], ["Sign up", "/signup"], ["Dashboard", "/"]]} />
        </div>
        <div className="border-t border-border/50">
          <div className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Stickmax · stickmax.io — All rights reserved.
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
