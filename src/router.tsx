import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { toast } from "sonner";
import { isRecoverableProviderError, recoverableProviderMessage } from "./lib/humanize-error";

// Per-route error boundary: a single broken page renders this fallback inside
// the shared layout instead of crashing the whole app.
function RouteErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(true);

  const recoverable = isRecoverableProviderError(error);

  useEffect(() => {
    if (!recoverable) return;
    try {
      toast.error(recoverableProviderMessage(error));
    } catch {
      /* ignore */
    }
    const id = window.setTimeout(() => {
      void router.invalidate({ sync: true }).finally(reset);
    }, 50);
    return () => window.clearTimeout(id);
  }, [recoverable, error, reset, router]);

  useEffect(() => {
    if (recoverable) return;
    const route = typeof window !== "undefined" ? window.location.pathname : "ssr";
    console.error("[route-error]", {
      route,
      component: "RouteErrorFallback",
      message: error?.message ?? String(error),
    });

    if (typeof window === "undefined") {
      setRetrying(false);
      return;
    }

    const key = `stickmax.route-recovery:${route}`;
    const alreadyTried = window.sessionStorage.getItem(key) === "1";
    if (alreadyTried) {
      setRetrying(false);
      return;
    }

    window.sessionStorage.setItem(key, "1");
    const id = window.setTimeout(() => {
      void router.invalidate({ sync: true }).finally(reset);
    }, 80);
    return () => window.clearTimeout(id);
  }, [error, reset, router, recoverable]);

  if (recoverable) return <RoutePendingSkeleton />;

  if (retrying) return <RoutePendingSkeleton />;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">Page recovery needed</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your project data is safe. Refresh this page or try opening it again.
      </p>
      <button
        onClick={() => {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(`stickmax.route-recovery:${window.location.pathname}`);
          }
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
