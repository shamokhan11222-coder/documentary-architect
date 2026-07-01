import { useSyncExternalStore } from "react";

const KEY = "docos.theme";
type Theme = "light" | "dark";
const listeners = new Set<() => void>();

function current(): Theme {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(KEY) as Theme) || "light";
}

export function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", current() === "dark");
}

export function toggleTheme() {
  const next: Theme = current() === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, next);
  applyTheme();
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (localStorage.getItem(KEY) as Theme) || "light",
    () => "light",
  );
}
