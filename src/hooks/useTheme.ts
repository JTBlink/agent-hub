import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import * as api from "../lib/tauri";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(resolved: ResolvedTheme, mode: Theme) {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
    return "dark";
  });

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (theme !== "system") return () => {};
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [theme],
  );
  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    () => (theme === "system" ? getSystemTheme() : "light"),
    () => "light",
  );
  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    applyThemeClass(resolvedTheme, theme);
  }, [resolvedTheme, theme]);

  // Load from Tauri settings on mount
  useEffect(() => {
    api.getSettings("theme").then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        setThemeState(v);
        localStorage.setItem(STORAGE_KEY, v);
      }
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    api.setSettings("theme", next);
  }, []);

  return { theme, setTheme, resolvedTheme };
}
