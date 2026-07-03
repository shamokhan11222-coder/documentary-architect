import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "../components/ui/sonner";
import { applyTheme, toggleTheme, useTheme } from "../lib/theme";
import {
  Moon,
  Sun,
  Menu,
  X,
  Home,
  LayoutDashboard,
  FolderKanban,
  Search,
  BookText,
  FileSearch,
  Image as ImageIcon,
  ImagePlus,
  BarChart3,
  Star,
  Mic,
  Captions,
  ListVideo,
  GanttChartSquare,
  Music,
  ListChecks,
  Download,
  Library,
  Dna,
  Sparkles,
  PenLine,
  BookOpen,
  KeyRound,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { AIChat } from "../components/AIChat";
import { getGateStatus } from "../lib/gate.functions";
import { Logo } from "../components/Logo";
import { PageTransition } from "../components/motion";
import { useAccount, logout, initials, useCredits, useIsAdmin } from "../lib/account";
import { toast } from "sonner";
import { Coins, LogIn, LogOut, Infinity as InfinityIcon, ChevronsUpDown, Settings as SettingsIcon, CreditCard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";

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
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/app-icon.svg" },
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

function RouteMotion() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <PageTransition routeKey={pathname}>
      <Outlet />
    </PageTransition>
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
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/70 glass px-4 py-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle navigation"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Logo />
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden">
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <RouteMotion />
          </main>
        </div>
      </div>
      <AIChat />
      <Toaster />
    </QueryClientProvider>
  );
}

type NavItem =
  | { section: string }
  | { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { section: "Studio" },
  { to: "/", label: "Home", icon: Home },
  { to: "/manager", label: "Production Dashboard", icon: LayoutDashboard },
  { to: "/topics", label: "Projects", icon: FolderKanban },
  { to: "/credits", label: "Credits", icon: Coins },
  { to: "/research", label: "Research", icon: Search },
  { to: "/story", label: "Story", icon: BookText },
  { to: "/script-analyzer", label: "Script Analyzer", icon: FileSearch },
  { to: "/visual", label: "Images", icon: ImageIcon },
  { to: "/thumbnail", label: "Thumbnail", icon: ImagePlus },
  { to: "/seo", label: "SEO", icon: BarChart3 },
  { to: "/rating", label: "Rating", icon: Star },
  { section: "Production" },
  { to: "/voice", label: "Voice Studio", icon: Mic },
  { to: "/subtitles", label: "Subtitles", icon: Captions },
  { to: "/queue", label: "Image Queue", icon: ListVideo },
  { to: "/timeline", label: "Timeline", icon: GanttChartSquare },
  { to: "/audio", label: "Music & SFX", icon: Music },
  { to: "/checklist", label: "Checklist", icon: ListChecks },
  { to: "/export", label: "Export", icon: Download },
  { section: "Library" },
  { to: "/assets", label: "Assets Library", icon: Library },
  { to: "/visual-dna", label: "Visual DNA", icon: Dna },
  { to: "/instructions", label: "AI Instructions", icon: Sparkles },
  { to: "/visual-instructions", label: "Visual Instructions", icon: PenLine },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/api-keys", label: "API Settings", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const theme = useTheme();
  const account = useAccount();
  const { balance } = useCredits();
  const admin = useIsAdmin();
  const low = !admin && balance <= 10;
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border/70 glass shadow-[8px_0_40px_-24px_rgba(16,24,40,0.35)]">
      <div className="px-5 py-6">
        <Logo />
        <div className="mt-1.5 pl-9 text-xs text-muted-foreground">stickmax.io</div>
      </div>
      <nav className="flex flex-col gap-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((item, i) =>
          "section" in item ? (
            <div
              key={`s-${i}`}
              className="px-3 pb-1.5 pt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60"
            >
              {item.section}
            </div>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              onClick={onNavigate}
              style={{ animation: "var(--animate-slide-in-left)", animationDelay: `${i * 22}ms` }}
              className="group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:translate-x-0.5 hover:bg-accent/70 hover:text-foreground [&.active]:bg-brand/10 [&.active]:font-medium [&.active]:text-brand"
            >
              <item.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="truncate">{item.label}</span>
            </Link>
          ),
        )}
      </nav>
      <div className="mt-auto space-y-2 border-t border-border/60 p-3">
        {/* Credits balance */}
        <Link
          to="/credits"
          onClick={onNavigate}
          className="flex items-center justify-between rounded-xl border border-border/70 bg-card/50 px-3 py-2 text-sm transition-colors hover:border-brand/40"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Coins className={`h-4 w-4 ${low ? "text-destructive" : "text-brand"}`} />
            Credits
          </span>
          {admin ? (
            <span className="flex items-center gap-1 font-semibold text-brand">
              <InfinityIcon className="h-4 w-4" /> Unlimited
            </span>
          ) : (
            <span className={`font-semibold ${low ? "text-destructive" : "text-foreground"}`}>
              {balance}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-accent/70 hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        {/* Account / profile area */}
        {account ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-card/50 p-2.5 text-left transition-colors hover:border-brand/40 focus:outline-none">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
                {initials(account.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{account.name}</div>
                <div className="truncate text-[11px] capitalize text-muted-foreground">
                  {admin ? "Owner · Admin" : `${account.plan} plan`}
                </div>
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52">
              <DropdownMenuLabel className="truncate">{account.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/credits" onClick={onNavigate}>
                  <CreditCard className="h-4 w-4" /> Credits
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" onClick={onNavigate}>
                  <SettingsIcon className="h-4 w-4" /> Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  toast.success("Signed out");
                }}
              >
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            to="/login"
            onClick={onNavigate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground shadow-soft transition-transform hover:-translate-y-0.5"
          >
            <LogIn className="h-4 w-4" /> Log in
          </Link>
        )}
      </div>
    </aside>
  );
}
