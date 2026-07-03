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
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&family=Geist:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&f[]=general-sans@400,500,600,700&display=swap",
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
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
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
  const { balance } = useCredits();
  const theme = useTheme();
  const low = !admin && balance <= 10;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 glass px-4 py-3 md:px-6">
      {/* Mobile menu toggle */}
      <button
        onClick={onOpenMobileNav}
        aria-label="Toggle navigation"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <label className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border/60 bg-card/50 px-3 py-2 transition-all duration-300 focus-within:border-brand/50 focus-within:bg-card focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,transparent)] md:max-w-md">
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

        {/* Theme */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-xl p-2 text-muted-foreground transition-all duration-200 hover:bg-accent/70 hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        <TopSeparator />

        {/* Credits */}
        <Link
          to="/credits"
          className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/50 px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand/40"
        >
          <Coins className={`h-4 w-4 ${low ? "text-destructive" : "text-brand"}`} />
          {admin ? (
            <span className="flex items-center gap-1 font-semibold text-brand">
              <InfinityIcon className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className={`font-semibold ${low ? "text-destructive" : "text-foreground"}`}>{balance}</span>
          )}
        </Link>

        <TopSeparator />

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
    </header>
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
            <Logo />
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

// Primary tabs — the reduced, clutter-free core of the studio.
const PRIMARY_NAV: NavLink[] = [
  { to: "/", label: "Studio", icon: Home },
  { to: "/topics", label: "Projects", icon: FolderKanban },
  { to: "/research", label: "Research", icon: Search },
  { to: "/story", label: "Story", icon: BookText },
  { to: "/visual", label: "Images", icon: ImageIcon },
  { to: "/thumbnail", label: "Thumbnail", icon: ImagePlus },
  { to: "/voice", label: "Voice", icon: Mic },
  { to: "/seo", label: "SEO", icon: BarChart3 },
  { to: "/export", label: "Export", icon: Download },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Everything else lives under a collapsible "More tools" group.
const MORE_NAV: NavLink[] = [
  { to: "/manager", label: "Production Dashboard", icon: LayoutDashboard },
  { to: "/credits", label: "Credits", icon: Coins },
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
      className={`group flex items-center gap-2.5 rounded-xl py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-accent/70 hover:text-foreground [&.active]:bg-brand/10 [&.active]:font-medium [&.active]:text-brand ${
        collapsed ? "justify-center px-2" : "px-3 hover:translate-x-0.5"
      }`}
    >
      <item.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const theme = useTheme();
  const account = useAccount();
  const { balance } = useCredits();
  const admin = useIsAdmin();
  const low = !admin && balance <= 10;
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border/70 glass shadow-[8px_0_40px_-24px_rgba(16,24,40,0.35)] transition-[width] duration-300 ${
        collapsed ? "w-[4.5rem]" : "w-60"
      }`}
      style={{ transitionTimingFunction: "var(--ease-out-quint)" }}
    >
      <div className={`flex items-center justify-between py-6 ${collapsed ? "px-3" : "px-5"}`}>
        {collapsed ? (
          <Link to="/" className="mx-auto">
            <Logo showWordmark={false} />
          </Link>
        ) : (
          <Link to="/">
            <Logo />
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
        {PRIMARY_NAV.map((item, i) => (
          <SidebarLink
            key={item.to}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
            delay={i * 22}
          />
        ))}

        {!collapsed && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            More tools
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
            />
          </button>
        )}
        {(moreOpen || collapsed) &&
          MORE_NAV.map((item, i) => (
            <SidebarLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
              delay={i * 18}
            />
          ))}
      </nav>
      <div className={`mt-auto space-y-2 border-t border-border/60 p-3 ${collapsed ? "hidden" : ""}`}>
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
