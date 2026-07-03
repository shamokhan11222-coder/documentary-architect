import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Per-route error boundary: a single broken page renders this fallback inside
// the shared layout instead of crashing the whole app.
function RouteErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[route-error]", {
      route: typeof window !== "undefined" ? window.location.pathname : "ssr",
      component: "RouteErrorFallback",
      message: error?.message ?? String(error),
    });
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">This section didn't load</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong on this page. The rest of the app is still working.
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}

// Lightweight skeleton shown instantly while a route's code chunk / loader is
// resolving. Prevents the previous page from lingering during navigation.
function RoutePendingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10 md:py-12">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted/60" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-muted/40" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultErrorComponent: RouteErrorFallback,
    defaultPendingComponent: RoutePendingSkeleton,
    // Show the skeleton immediately instead of holding the old page.
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });

  return router;
};
