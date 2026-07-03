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

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteErrorFallback,
  });

  return router;
};
