import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQs — Stickmax Studio" },
      {
        name: "description",
        content: "Frequently asked questions about Stickmax Studio, credits, and plans.",
      },
      { property: "og:title", content: "FAQs — Stickmax Studio" },
      { property: "og:description", content: "Answers about credits, plans, and workflow." },
    ],
  }),
  component: FaqPage,
});

const FAQS = [
  {
    q: "What is Stickmax Studio?",
    a: "Stickmax Studio is an AI production assistant for USA documentary YouTube channels. It runs a full pipeline — topic engine, research, story, images, thumbnails, voice, SEO and export.",
  },
  {
    q: "How do credits work?",
    a: "Every AI action spends credits (research, story, images, thumbnails, voice, etc). Your plan includes a monthly credit allowance, and you can top up any time from the Credits page.",
  },
  {
    q: "What happens when I run low on credits?",
    a: "You'll see a low-credit warning in the sidebar and on the Credits page. You can keep working, but generation will pause once you hit zero until you top up.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes — upgrade, downgrade, or cancel at any time. Unused credits roll into your balance for the current period.",
  },
  {
    q: "Do you keep my projects private?",
    a: "Yes. Stickmax Studio is built private-first. Your projects and generated assets stay with you.",
  },
];

function FaqPage() {
  return (
    <div className="brand-gradient min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Frequently asked questions
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything you need to know about Stickmax Studio.
        </p>
        <div className="glass-card mt-10 rounded-3xl p-4 md:p-6">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-semibold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Ready to start?{" "}
          <Link to="/pricing" className="font-medium text-brand hover:underline">
            See pricing
          </Link>
        </p>
      </div>
    </div>
  );
}
