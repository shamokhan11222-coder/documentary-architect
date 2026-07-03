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
import { applyTheme } from "../lib/theme";
import { applyPerfProfile } from "../lib/perf";
import {
  Menu,
  X,
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
import { CreditGate } from "../components/CreditGate";
import { getGateStatus } from "../lib/gate.functions";
import { Logo } from "../components/Logo";
import { PageTransition } from "../components/motion";
import { useAccount, logout, initials, useCredits, useIsAdmin, useHasUnlimitedAccess } from "../lib/account";
import { toast } from "sonner";
import { Coins, LogIn, LogOut, Infinity as InfinityIcon, ChevronsUpDown, Settings as SettingsIcon, CreditCard, PanelLeftClose, PanelLeftOpen, ChevronDown, Bell } from "lucide-react";
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

type GateStatus = { enabled: boolean; unlocked: boolean };
let openGateCache: GateStatus | null = null;

async function getFastGateStatus(): Promise<GateStatus> {
  if (openGateCache) return openGateCache;

  if (typeof window !== "undefined") {
    try {
      const raw =
        window.localStorage.getItem("stickmax.gate.status") ??
        window.sessionStorage.getItem("stickmax.gate.status");
      if (raw) {
        const cached = JSON.parse(raw) as GateStatus & { at?: number };
        if (
          typeof cached.enabled === "boolean" &&
          typeof cached.unlocked === "boolean" &&
          Date.now() - (cached.at ?? 0) < 5 * 60 * 1000
        ) {
          return { enabled: cached.enabled, unlocked: cached.unlocked };
        }
      }
    } catch {
      /* ignore stale cache */
    }
  }

  const status = await getGateStatus();
  if (!status.enabled) openGateCache = status;

  if (typeof window !== "undefined") {
    try {
      const payload = JSON.stringify({ ...status, at: Date.now() });
      // localStorage is shared across tabs so new tabs skip the round-trip.
      window.localStorage.setItem("stickmax.gate.status", payload);
      window.sessionStorage.setItem("stickmax.gate.status", payload);
    } catch {
      /* ignore cache failures */
    }
  }

  return status;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    // Private-access gate: only redirects when SITE_PASSWORD is configured on
    // the deployment. Open by default so the app works as a normal website.
    if (location.pathname === "/unlock") return;
    const status = await getFastGateStatus();
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
      { property: "og:url", content: "https://stickmax.io" },
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
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap",
      },
      { rel: "preconnect", href: "https://api.fontshare.com" },
      { rel: "preconnect", href: "https://cdn.fontshare.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap",
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

// Public marketing/auth pages use the top navbar; everything else is the
// dashboard "studio" and uses the collapsible left sidebar.
const PUBLIC_PREFIXES = [
  "/landing",
  "/pricing",
  "/faq",
  "/docs",
  "/community",
  "/roadmap",
  "/login",
  "/signup",
  "/forgot-password",
  "/upgrade",
  "/unlock",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const publicPage = isPublicPath(pathname);

  useEffect(() => {
    applyTheme();
    applyPerfProfile();
  }, []);

  // Public layout: top navbar + full-width content.
  if (publicPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <TopNavbar />
          <main className="min-w-0 flex-1">
            <RouteMotion />
          </main>
        </div>
        <Toaster />
      </QueryClientProvider>
    );
  }

  // Dashboard layout: collapsible left sidebar.
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop floating sidebar */}
        <div className="hidden md:flex">
          <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)} />
        </div>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full p-3">
              <Sidebar mobile onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Dashboard top navbar */}
          <DashboardTopbar onOpenMobileNav={() => setMobileNavOpen((v) => !v)} />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <RouteMotion />
          </main>
        </div>
      </div>
      <AIChat />
      <Toaster />
      <CreditGate />
    </QueryClientProvider>
  );
}

const TOP_LINKS = [
  { to: "/landing", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/docs", label: "Docs" },
  { to: "/community", label: "Community" },
  { to: "/roadmap", label: "Roadmap" },
] as const;

function TopSeparator() {
  return <span className="mx-1 hidden h-6 w-px bg-border/70 sm:block" aria-hidden />;
}

const NOTIFICATIONS = [
  { title: "Storyboard render finished", detail: "8 scene images are ready to review.", time: "2m" },
  { title: "Voiceover generated", detail: "Your narration track is available.", time: "1h" },
  { title: "SEO pack ready", detail: "Titles, tags and description drafted.", time: "3h" },
];

function DashboardTopbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const account = useAccount();
  const admin = useIsAdmin();
  const unlimited = useHasUnlimitedAccess();
  const { balance } = useCredits();
  const low = !unlimited && balance <= 10;

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 glass">
      <div className="flex items-center gap-3 px-4 py-2.5 md:px-6">
      {/* Mobile menu toggle */}
      <button
        onClick={onOpenMobileNav}
        aria-label="Toggle navigation"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo */}
      <Link to="/" className="mr-1 hidden shrink-0 md:block">
        <Logo studio />
      </Link>

      {/* Search */}
      <label className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border/60 bg-card/50 px-3 py-2 transition-all duration-300 focus-within:border-brand/50 focus-within:bg-card focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,transparent)] md:max-w-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-brand" />
        <input
          type="search"
          placeholder="Search projects, tools, docs…"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
          ⌘K
        </kbd>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative rounded-xl p-2 text-muted-foreground transition-all duration-200 hover:bg-accent/70 hover:text-foreground focus:outline-none">
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-background" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-semibold text-brand">
                {NOTIFICATIONS.length} new
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NOTIFICATIONS.map((n) => (
              <div key={n.title} className="flex flex-col gap-0.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/60">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{n.title}</span>
                  <span className="text-[11px] text-muted-foreground">{n.time}</span>
                </div>
                <span className="text-xs text-muted-foreground">{n.detail}</span>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <TopSeparator />

        {/* Credits — hidden entirely for admin/developer accounts */}
        {!admin && (
        <Link
          to="/credits"
          className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/50 px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand/40"
        >
          <Coins className={`h-4 w-4 ${low ? "text-destructive" : "text-brand"}`} />
          {unlimited ? (
            <span className="flex items-center gap-1 font-semibold text-brand">
              <InfinityIcon className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className={`font-semibold ${low ? "text-destructive" : "text-foreground"}`}>{balance}</span>
          )}
        </Link>
        )}

        {!admin && <TopSeparator />}

        {/* Profile / Settings / Logout */}
        {account ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-transparent p-1 pr-2 text-left transition-colors hover:bg-accent/60 focus:outline-none">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
                {initials(account.name)}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-[9rem] truncate text-sm font-medium text-foreground">{account.name}</span>
                <span className="block text-[11px] capitalize text-muted-foreground">
                  {admin ? "Owner · Admin" : `${account.plan} plan`}
                </span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{account.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/credits">
                  <CreditCard className="h-4 w-4" /> Credits
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <SettingsIcon className="h-4 w-4" /> Settings
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
            className="flex items-center gap-2 rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground shadow-soft transition-transform hover:-translate-y-0.5"
          >
            <LogIn className="h-4 w-4" /> Log in
          </Link>
        )}
      </div>
      </div>

      {/* Primary navigation — animated underline */}
      <nav className="hidden items-center gap-6 overflow-x-auto px-6 pb-1.5 md:flex">
        {STUDIO_TOP_NAV.map((l) => (
          <TopNavLink key={l.to} to={l.to} label={l.label} exact={l.to === "/"} />
        ))}
      </nav>
    </header>
  );
}

function TopNavLink({
  to,
  label,
  exact,
  onClick,
}: {
  to: string;
  label: string;
  exact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      onClick={onClick}
      className="group relative shrink-0 py-1 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground [&.active]:text-foreground"
    >
      {label}
      <span className="pointer-events-none absolute -bottom-0.5 left-0 h-0.5 w-full origin-left scale-x-0 rounded-full bg-brand shadow-[0_0_10px_color-mix(in_oklab,var(--brand)_60%,transparent)] transition-transform duration-300 ease-out group-hover:scale-x-100 group-[.active]:scale-x-100" />
    </Link>
  );
}

function TopNavbar() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-8">
          <Link to="/landing" className="shrink-0">
            <Logo studio />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {TOP_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground [&.active]:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {!account && (
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Login
            </Link>
          )}
          <Link
            to="/"
            className="btn-press flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-soft"
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 px-5 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {TOP_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              {!account && (
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-center text-sm font-medium"
                >
                  Login
                </Link>
              )}
              <Link
                to="/"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl bg-brand px-3 py-2 text-center text-sm font-semibold text-brand-foreground"
              >
                Dashboard
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

type NavLink = { to: string; label: string; icon: LucideIcon };

// Primary navigation — lives in the top bar (animated underline).
const STUDIO_TOP_NAV: NavLink[] = [
  { to: "/topics", label: "Projects", icon: FolderKanban },
  { to: "/research", label: "Research", icon: Search },
  { to: "/story", label: "Story", icon: BookText },
  { to: "/visual", label: "Images", icon: ImageIcon },
  { to: "/voice", label: "Voice", icon: Mic },
  { to: "/thumbnail", label: "Thumbnail", icon: ImagePlus },
  { to: "/seo", label: "SEO", icon: BarChart3 },
  { to: "/community", label: "Community", icon: Sparkles },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
];

// Secondary navigation — lives in the collapsible left sidebar, grouped into
// clear sections for a premium, Linear-style hierarchy.
type NavSection = { title: string; items: NavLink[] };
const SECONDARY_NAV: NavLink[] = [
  { to: "/manager", label: "Production Dashboard", icon: LayoutDashboard },
  { to: "/export", label: "Export", icon: Download },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/script-analyzer", label: "Script Analyzer", icon: FileSearch },
  { to: "/rating", label: "Rating", icon: Star },
  { to: "/subtitles", label: "Subtitles", icon: Captions },
  { to: "/queue", label: "Image Queue", icon: ListVideo },
  { to: "/timeline", label: "Timeline", icon: GanttChartSquare },
  { to: "/audio", label: "Music & SFX", icon: Music },
  { to: "/checklist", label: "Checklist", icon: ListChecks },
  { to: "/assets", label: "Assets Library", icon: Library },
  { to: "/visual-dna", label: "Visual DNA", icon: Dna },
  { to: "/instructions", label: "AI Instructions", icon: Sparkles },
  { to: "/visual-instructions", label: "Visual Instructions", icon: PenLine },
  { to: "/api-keys", label: "API Settings", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
];
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Production",
    items: [
      { to: "/manager", label: "Production Dashboard", icon: LayoutDashboard },
      { to: "/timeline", label: "Timeline", icon: GanttChartSquare },
      { to: "/queue", label: "Image Queue", icon: ListVideo },
      { to: "/checklist", label: "Checklist", icon: ListChecks },
      { to: "/export", label: "Export", icon: Download },
    ],
  },
  {
    title: "Craft",
    items: [
      { to: "/script-analyzer", label: "Script Analyzer", icon: FileSearch },
      { to: "/rating", label: "Rating", icon: Star },
      { to: "/subtitles", label: "Subtitles", icon: Captions },
      { to: "/audio", label: "Music & SFX", icon: Music },
    ],
  },
  {
    title: "Library",
    items: [
      { to: "/assets", label: "Assets Library", icon: Library },
      { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
      { to: "/visual-dna", label: "Visual DNA", icon: Dna },
    ],
  },
  {
    title: "Configuration",
    items: [
      { to: "/instructions", label: "AI Instructions", icon: Sparkles },
      { to: "/visual-instructions", label: "Visual Instructions", icon: PenLine },
      { to: "/api-keys", label: "API Settings", icon: KeyRound },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function SidebarLink({
  item,
  collapsed,
  onNavigate,
  delay,
}: {
  item: NavLink;
  collapsed?: boolean;
  onNavigate?: () => void;
  delay: number;
}) {
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/" }}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      style={{ animation: "var(--animate-slide-in-left)", animationDelay: `${delay}ms` }}
      className={`nav-pill group relative flex items-center gap-2.5 rounded-xl py-2 text-sm text-muted-foreground hover:text-foreground [&.active]:nav-pill-active [&.active]:font-medium [&.active]:text-brand ${
        collapsed ? "justify-center px-2" : "px-3 hover:translate-x-0.5"
      }`}
    >
      <span className="pointer-events-none absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand opacity-0 shadow-[0_0_12px_color-mix(in_oklab,var(--brand)_75%,transparent)] transition-opacity duration-200 group-[.active]:opacity-100" />
      <item.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  mobile = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobile?: boolean;
}) {
  return (
    <aside
      className={`sidebar-glass sticky top-4 my-4 ml-4 flex h-[calc(100vh-2rem)] shrink-0 flex-col rounded-3xl transition-[width] duration-300 ${
        collapsed ? "w-[4.75rem]" : "w-60"
      }`}
      style={{ transitionTimingFunction: "var(--ease-out-quint)" }}
    >
      <div className={`relative flex items-center justify-between py-6 after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent ${collapsed ? "px-3" : "px-5"}`}>
        {collapsed ? (
          <Link to="/" className="mx-auto">
            <Logo showWordmark={false} />
          </Link>
        ) : (
          <Link to="/">
            <Logo studio />
          </Link>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
              collapsed ? "hidden" : ""
            }`}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="mx-auto mb-2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
      <nav className="flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {/* On mobile the top bar is hidden, so surface primary nav here too */}
        {mobile && (
          <>
            <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              Primary
            </p>
            {STUDIO_TOP_NAV.map((item, i) => (
              <SidebarLink
                key={item.to}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
                delay={i * 18}
              />
            ))}
          </>
        )}
        {collapsed ? (
          SECONDARY_NAV.map((item, i) => (
            <SidebarLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
              delay={i * 14}
            />
          ))
        ) : (
          NAV_SECTIONS.map((section, si) => (
            <div key={section.title} className={si === 0 ? "" : "mt-4"}>
              <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">
                {section.title}
              </p>
              {section.items.map((item, i) => (
                <SidebarLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  delay={(si * 4 + i) * 14}
                />
              ))}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
