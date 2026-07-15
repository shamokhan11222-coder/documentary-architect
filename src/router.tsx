import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isRecoverableProviderError } from "./lib/humanize-error";

// Per-route error boundary: renders inline inside the shared layout. It is
// intentionally passive — no auto-invalidate, no setTimeout recovery, no
// useEffect-driven reset. Recovery only happens on an explicit user click,
// so a transient provider error never triggers a retry loop or a hook-count
// mismatch on the next render.
function RouteErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const recoverable = isRecoverableProviderError(error);

  // Log once for diagnostics — no side effects, no state changes.
  console.error("[route-error]", error?.message ?? String(error));

  if (recoverable) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-lg font-semibold text-foreground">Generation unavailable</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Generation failed, but your saved project data is safe. Please retry or select another model.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retry
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          <a
            href="/api-keys"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Open API Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">Generation unavailable</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The AI request failed, but your saved project data is safe.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Retry
        </button>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Go home
        </a>
        <a
          href="/api-keys"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Open API Settings
        </a>
      </div>
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
