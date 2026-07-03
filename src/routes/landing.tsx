import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Search, BookText, Image as ImageIcon, Mic, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/Logo";

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

function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/pricing">Pricing</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/faq">FAQs</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/login">Log in</Link></Button>
            <Button asChild variant="brand" size="sm"><Link to="/signup">Get started</Link></Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="brand-gradient">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> AI documentary production
            </span>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Your entire <span className="text-brand">documentary studio</span>, powered by AI
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              From a curiosity-driven topic to a finished, exportable video — Stickmax Studio runs
              the whole pipeline so you can publish more, faster.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="lg">
                <Link to="/signup">Start creating <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>
          <div className="glass-card float rounded-3xl p-8">
            <div className="flex items-center gap-3">
              <LogoMark className="h-12 w-12" />
              <div>
                <div className="font-display text-lg font-bold">Stickmax Studio</div>
                <div className="text-sm text-muted-foreground">Command center preview</div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {["Topics", "Research", "Story", "Images", "Voice", "Export"].map((s) => (
                <div key={s} className="rounded-xl border border-border/60 bg-card/60 px-3 py-4 text-center text-sm font-medium">
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
          One flow, end to end
        </h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="brand-gradient">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Ready to build your next documentary?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Join creators using Stickmax Studio to research, write, and produce faster.
          </p>
          <Button asChild variant="brand" size="lg" className="mt-8">
            <Link to="/signup">Get started free</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
