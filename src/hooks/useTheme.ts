import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { productConfig } from "@app/product";
import { useWorkbench } from "../app/product/workbench";
import * as api from "../lib/tauri";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const themeProduct: { id: string; dataId?: string } = productConfig;

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

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
  const { appearance } = useWorkbench();
  const storageKey =
    themeProduct.dataId && themeProduct.dataId !== themeProduct.id
      ? `theme:${themeProduct.id}`
      : "theme";
  const [savedTheme, setSavedTheme] = useState<Theme | null>(() => {
    const stored = localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : null;
  });
  const theme = savedTheme ?? appearance.theme ?? "dark";

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

  useLayoutEffect(() => {
    applyThemeClass(resolvedTheme, theme);
  }, [resolvedTheme, theme]);

  // Load from Tauri settings on mount
  useEffect(() => {
    api.getSettings(storageKey).then((v) => {
      if (isTheme(v)) {
        setSavedTheme(v);
        localStorage.setItem(storageKey, v);
      }
    });
  }, [storageKey]);

  const setTheme = useCallback(
    (next: Theme) => {
      setSavedTheme(next);
      localStorage.setItem(storageKey, next);
      api.setSettings(storageKey, next);
    },
    [storageKey],
  );

  return { theme, setTheme, resolvedTheme };
}
