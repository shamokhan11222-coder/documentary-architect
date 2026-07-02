import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "../components/ui/sonner";
import { applyTheme, toggleTheme, useTheme } from "../lib/theme";
import { Moon, Sun, Menu, X } from "lucide-react";
import { AIChat } from "../components/AIChat";
import { getGateStatus } from "../lib/gate.functions";
import { Logo, LogoMark } from "../components/Logo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    // Private-access gate: only redirects when SITE_PASSWORD is configured on
    // the deployment. Open by default so the app works as a normal website.
    if (location.pathname === "/unlock") return;
    const status = await getGateStatus();
    if (status.enabled && !status.unlocked) {
      throw redirect({ to: "/unlock" });
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Stickmax Studio — AI Production Assistant" },
      {
        name: "description",
        content:
          "Private AI workflow for YouTube documentaries: topic engine, research engine, and story engine.",
      },
      { name: "author", content: "Stickmax Studio" },
      { property: "og:title", content: "Stickmax Studio" },
      {
        property: "og:description",
        content: "Private AI documentary production assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-4 py-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle navigation"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Logo />
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden">
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </main>
        </div>
      </div>
      <AIChat />
      <Toaster />
    </QueryClientProvider>
  );
}

const NAV = [
  { section: "Studio" },
  { to: "/", label: "Home" },
  { to: "/manager", label: "Production Dashboard" },
  { to: "/topics", label: "Projects" },
  { to: "/research", label: "Research" },
  { to: "/story", label: "Story" },
  { to: "/script-analyzer", label: "Script Analyzer" },
  { to: "/visual", label: "Images" },
  { to: "/thumbnail", label: "Thumbnail" },
  { to: "/seo", label: "SEO" },
  { to: "/rating", label: "Rating" },
  { section: "Production" },
  { to: "/voice", label: "Voice Studio" },
  { to: "/subtitles", label: "Subtitles" },
  { to: "/queue", label: "Image Queue" },
  { to: "/timeline", label: "Timeline" },
  { to: "/audio", label: "Music & SFX" },
  { to: "/checklist", label: "Checklist" },
  { to: "/export", label: "Export" },
  { section: "Library" },
  { to: "/assets", label: "Assets Library" },
  { to: "/visual-dna", label: "Visual DNA" },
  { to: "/instructions", label: "AI Instructions" },
  { to: "/visual-instructions", label: "Visual Instructions" },
  { to: "/knowledge", label: "Knowledge Base" },
  { to: "/api-keys", label: "API Settings" },
  { to: "/settings", label: "Settings" },
] as const;

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const theme = useTheme();
  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-border bg-card">
      <div className="px-4 py-5">
        <Logo />
        <div className="mt-1 pl-9 text-xs text-muted-foreground">stickmax.io</div>
      </div>
      <nav className="flex flex-col gap-1 overflow-y-auto px-2">
        {NAV.map((item, i) =>
          "section" in item ? (
            <div
              key={`s-${i}`}
              className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
            >
              {item.section}
            </div>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              onClick={onNavigate}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:font-medium [&.active]:text-foreground"
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>
      <div className="mt-auto p-2">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </aside>
  );
}
