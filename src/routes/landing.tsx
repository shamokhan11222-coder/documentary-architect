import { createFileRoute, redirect } from "@tanstack/react-router";

// Owner-only studio — the public marketing landing is retired.
export const Route = createFileRoute("/landing")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
