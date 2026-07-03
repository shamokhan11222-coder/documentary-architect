import { useSyncExternalStore } from "react";

type Theme = "light";

export function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
}

export function toggleTheme() {
  applyTheme();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    () => () => {},
    () => "light" as const,
    () => "light" as const,
  );
}
