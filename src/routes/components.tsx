import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Search,
  Mail,
  Sparkles,
  Settings,
  User,
  LogOut,
  Rocket,
  Bell,
} from "lucide-react";
import {
  PButton,
  PInput,
  PTextarea,
  PCard,
  PCardHeader,
  PCardTitle,
  PCardDescription,
  PCardFooter,
  PBadge,
  PTabs,
  PTabsList,
  PTabsTrigger,
  PTabsContent,
  PAccordion,
  PAccordionItem,
  PAccordionTrigger,
  PAccordionContent,
  PProgress,
  PModal,
  PModalTrigger,
  PModalContent,
  PModalHeader,
  PModalTitle,
  PModalDescription,
  PModalFooter,
  PModalClose,
  PDropdown,
  PDropdownTrigger,
  PDropdownContent,
  PDropdownItem,
  PDropdownLabel,
  PDropdownSeparator,
  PTooltip,
  PTooltipProvider,
  PSkeleton,
  PSkeletonCard,
  PSpinner,
  PDots,
  PLoader,
  GlassPanel,
  notify,
} from "@/components/premium";

export const Route = createFileRoute("/components")({
  head: () => ({
    meta: [
      { title: "Component Library — Stickmax Studio" },
      {
        name: "description",
        content:
          "The Stickmax premium component library: buttons, inputs, cards, badges, tabs, modals and more on one consistent design system.",
      },
      { property: "og:title", content: "Component Library — Stickmax Studio" },
      { property: "og:description", content: "One spacing, radius and shadow system across every component." },
    ],
  }),
  component: ComponentsPage,
});

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <PCard variant="glass" padding="lg" rounded="lg">
        {children}
      </PCard>
    </section>
  );
}

function ComponentsPage() {
  const [progress, setProgress] = useState(64);
  const [loading, setLoading] = useState(false);

  return (
    <PTooltipProvider>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <header className="mb-12">
          <PBadge variant="brand" dot>
            Design system
          </PBadge>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">
            Premium Component Library
          </h1>
          <p className="mt-3 max-w-xl text-lg text-muted-foreground">
            One spacing system. One radius system. One shadow system. Every block below is fully
            reusable and consistent.
          </p>
        </header>

        <div className="flex flex-col gap-14">
          {/* Buttons */}
          <Section title="Buttons" subtitle="Six variants, four sizes, loading state.">
            <div className="flex flex-wrap items-center gap-3">
              <PButton variant="brand">Brand</PButton>
              <PButton variant="solid">Solid</PButton>
              <PButton variant="outline">Outline</PButton>
              <PButton variant="ghost">Ghost</PButton>
              <PButton variant="glass">Glass</PButton>
              <PButton variant="destructive">Delete</PButton>
              <PButton variant="link">Link</PButton>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PButton size="sm">Small</PButton>
              <PButton size="md">Medium</PButton>
              <PButton size="lg">
                <Rocket /> Large
              </PButton>
              <PButton size="icon" variant="outline" aria-label="Settings">
                <Settings />
              </PButton>
              <PButton
                loading={loading}
                onClick={() => {
                  setLoading(true);
                  setTimeout(() => setLoading(false), 1600);
                }}
              >
                {loading ? "Working" : "Click to load"}
              </PButton>
            </div>
          </Section>

          {/* Inputs */}
          <Section title="Inputs" subtitle="Labels, icons, hints and error states.">
            <div className="grid gap-5 sm:grid-cols-2">
              <PInput label="Search" placeholder="Find anything…" leftIcon={<Search />} />
              <PInput label="Email" type="email" placeholder="you@studio.com" leftIcon={<Mail />} hint="We never share it." />
              <PInput label="Project name" placeholder="Untitled" defaultValue="Bad" error="Name is too short." />
              <PTextarea label="Notes" placeholder="Write something premium…" />
            </div>
          </Section>

          {/* Cards */}
          <Section title="Cards & Glass panels" subtitle="Solid, outline, glass — all on the same radius & shadow scale.">
            <div className="grid gap-5 md:grid-cols-3">
              <PCard variant="solid" interactive>
                <PCardHeader>
                  <PCardTitle>Solid card</PCardTitle>
                  <PCardDescription>Hover to lift and glow.</PCardDescription>
                </PCardHeader>
                <p className="text-sm text-muted-foreground">Built on the shared token system.</p>
                <PCardFooter>
                  <PButton size="sm">Open</PButton>
                </PCardFooter>
              </PCard>
              <PCard variant="outline">
                <PCardHeader>
                  <PCardTitle>Outline card</PCardTitle>
                  <PCardDescription>Quiet and minimal.</PCardDescription>
                </PCardHeader>
                <p className="text-sm text-muted-foreground">Same padding, same corners.</p>
              </PCard>
              <GlassPanel sheen rounded="lg" padding="lg">
                <PCardTitle>Glass panel</PCardTitle>
                <PCardDescription>Frosted with a hover sheen.</PCardDescription>
                <p className="mt-3 text-sm text-muted-foreground">Perfect for overlays.</p>
              </GlassPanel>
            </div>
          </Section>

          {/* Badges */}
          <Section title="Badges" subtitle="Status pills with optional live dots.">
            <div className="flex flex-wrap items-center gap-3">
              <PBadge variant="brand">Brand</PBadge>
              <PBadge variant="neutral">Neutral</PBadge>
              <PBadge variant="success" dot>Live</PBadge>
              <PBadge variant="warning" dot>Pending</PBadge>
              <PBadge variant="danger" dot>Failed</PBadge>
              <PBadge variant="outline">Outline</PBadge>
            </div>
          </Section>

          {/* Tabs */}
          <Section title="Tabs">
            <PTabs defaultValue="overview">
              <PTabsList>
                <PTabsTrigger value="overview">Overview</PTabsTrigger>
                <PTabsTrigger value="activity">Activity</PTabsTrigger>
                <PTabsTrigger value="settings">Settings</PTabsTrigger>
              </PTabsList>
              <PTabsContent value="overview">
                <p className="text-sm text-muted-foreground">A calm overview panel with fade-up motion.</p>
              </PTabsContent>
              <PTabsContent value="activity">
                <p className="text-sm text-muted-foreground">Recent activity shows here.</p>
              </PTabsContent>
              <PTabsContent value="settings">
                <p className="text-sm text-muted-foreground">Settings live here.</p>
              </PTabsContent>
            </PTabs>
          </Section>

          {/* Accordion */}
          <Section title="Accordions">
            <PAccordion type="single" collapsible className="flex flex-col gap-3">
              <PAccordionItem value="a">
                <PAccordionTrigger>Is everything on one system?</PAccordionTrigger>
                <PAccordionContent>Yes — spacing, radius and shadow all come from tokens.ts.</PAccordionContent>
              </PAccordionItem>
              <PAccordionItem value="b">
                <PAccordionTrigger>Are these components reusable?</PAccordionTrigger>
                <PAccordionContent>Import anything from @/components/premium and drop it in.</PAccordionContent>
              </PAccordionItem>
            </PAccordion>
          </Section>

          {/* Progress */}
          <Section title="Progress bars" subtitle="Determinate and indeterminate.">
            <div className="flex flex-col gap-6">
              <PProgress value={progress} label="Rendering" showValue />
              <div className="flex gap-3">
                <PButton size="sm" variant="outline" onClick={() => setProgress((p) => Math.max(0, p - 10))}>
                  −10%
                </PButton>
                <PButton size="sm" variant="outline" onClick={() => setProgress((p) => Math.min(100, p + 10))}>
                  +10%
                </PButton>
              </div>
              <PProgress label="Uploading (indeterminate)" />
            </div>
          </Section>

          {/* Overlays */}
          <Section title="Modals, dropdowns & tooltips">
            <div className="flex flex-wrap items-center gap-3">
              <PModal>
                <PModalTrigger asChild>
                  <PButton>Open modal</PButton>
                </PModalTrigger>
                <PModalContent>
                  <PModalHeader>
                    <PModalTitle>Premium modal</PModalTitle>
                    <PModalDescription>Glassy, centered, animated in and out.</PModalDescription>
                  </PModalHeader>
                  <p className="text-sm text-muted-foreground">
                    Everything here uses the same radius and shadow language as the rest of the library.
                  </p>
                  <PModalFooter>
                    <PModalClose asChild>
                      <PButton variant="ghost">Cancel</PButton>
                    </PModalClose>
                    <PModalClose asChild>
                      <PButton>Confirm</PButton>
                    </PModalClose>
                  </PModalFooter>
                </PModalContent>
              </PModal>

              <PDropdown>
                <PDropdownTrigger asChild>
                  <PButton variant="outline">Menu</PButton>
                </PDropdownTrigger>
                <PDropdownContent>
                  <PDropdownLabel>Account</PDropdownLabel>
                  <PDropdownItem>
                    <User /> Profile
                  </PDropdownItem>
                  <PDropdownItem>
                    <Settings /> Settings
                  </PDropdownItem>
                  <PDropdownSeparator />
                  <PDropdownItem>
                    <LogOut /> Log out
                  </PDropdownItem>
                </PDropdownContent>
              </PDropdown>

              <PTooltip content="I'm a premium tooltip">
                <PButton variant="glass">
                  <Sparkles /> Hover me
                </PButton>
              </PTooltip>
            </div>
          </Section>

          {/* Notifications */}
          <Section title="Notifications" subtitle="Toast helpers with premium icons.">
            <div className="flex flex-wrap gap-3">
              <PButton variant="outline" onClick={() => notify.success("Saved!", { description: "Your changes are live." })}>
                <Bell /> Success
              </PButton>
              <PButton variant="outline" onClick={() => notify.error("Something broke", { description: "Please try again." })}>
                Error
              </PButton>
              <PButton variant="outline" onClick={() => notify.warning("Low credits", { description: "You have 3 left." })}>
                Warning
              </PButton>
              <PButton variant="outline" onClick={() => notify.info("New feature", { description: "Check the changelog." })}>
                Info
              </PButton>
            </div>
          </Section>

          {/* Loaders & Skeletons */}
          <Section title="Skeletons & loaders">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <p className="text-sm font-semibold">Loaders</p>
                <div className="flex items-center gap-8">
                  <PSpinner />
                  <PDots />
                  <PLoader size="sm" label="Loading" />
                </div>
                <div className="flex flex-col gap-2">
                  <PSkeleton className="h-4 w-3/4" />
                  <PSkeleton className="h-4 w-1/2" />
                  <PSkeleton className="h-4 w-2/3" />
                </div>
              </div>
              <PSkeletonCard />
            </div>
          </Section>
        </div>
      </div>
    </PTooltipProvider>
  );
}
