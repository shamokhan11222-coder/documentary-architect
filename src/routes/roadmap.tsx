import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap — Stickmax Studio" },
      { name: "description", content: "See what we're building next for Stickmax Studio." },
      { property: "og:title", content: "Roadmap — Stickmax Studio" },
      { property: "og:description", content: "See what we're building next for Stickmax Studio." },
    ],
  }),
  component: RoadmapPage,
});

function RoadmapPage() {
  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
          Roadmap
        </span>
        <h1 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
          Roadmap
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          See what we're building next for Stickmax Studio.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild variant="brand" size="lg" className="btn-press">
            <Link to="/">Open the Studio</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="btn-press">
            <Link to="/pricing">See pricing</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
