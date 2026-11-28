import { useSyncExternalStore } from "react";
import { productConfig } from "@app/product";
import catalog from "../../../products/workbench.json";
import type { Theme } from "../../hooks/useTheme";

export type WorkbenchCommand = keyof typeof catalog.defaults.shortcuts;
export type WorkbenchShortcuts = Readonly<Record<WorkbenchCommand, string>>;
export const workbenchModules = catalog.modules;
export type BuiltinModule = keyof typeof workbenchModules;

interface Workbench {
  sidebar: {
    primary: readonly string[];
    bottom: readonly string[];
    defaultPanel: string;
  };
  layout: {
    version: number;
    toolbar: readonly string[];
    sidebarWidth: number;
    startPage: string;
    startPath?: string;
  };
  appearance: {
    accent: string;
    textSize: string;
    theme?: Theme | null;
    palette?: string | null;
  };
  shortcuts: WorkbenchShortcuts;
}

const config: Pick<Workbench, "sidebar"> & Partial<Workbench> = productConfig;
let current: Workbench = {
  sidebar: config.sidebar,
  layout: config.layout ?? catalog.defaults.layout,
  appearance: config.appearance ?? catalog.defaults.appearance,
  shortcuts: config.shortcuts ?? catalog.defaults.shortcuts,
};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => current;

if (import.meta.hot) {
  import.meta.hot.on("agent-hub:workbench", (next: Workbench) => {
    current = next;
    listeners.forEach((listener) => listener());
  });
  import.meta.hot.on("agent-hub:workbench-error", (message: string) =>
    console.warn("Product layout preview:", message),
  );
  import.meta.hot.on("vite:ws:connect", () =>
    import.meta.hot?.send("agent-hub:workbench-request"),
  );
  import.meta.hot.send("agent-hub:workbench-request");
}

export const useWorkbench = () => useSyncExternalStore(subscribe, snapshot);

export function workbenchPath(id: string) {
  const module = Object.hasOwn(workbenchModules, id)
    ? workbenchModules[id as BuiltinModule]
    : undefined;
  return module && "path" in module ? module.path : undefined;
}

export function matchesWorkbenchShortcut(
  event: KeyboardEvent,
  shortcut: string,
) {
  const parts = shortcut.split("+");
  const key = parts.at(-1);
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.isComposing &&
    event.shiftKey === parts.includes("Shift") &&
    (event.key.toUpperCase() === key || (key === "," && event.code === "Comma"))
  );
}

export function nativeWorkbenchShortcut(shortcut: string) {
  return shortcut.replace("Mod+", "CmdOrCtrl+");
}

export function workbenchShortcutLabel(shortcut: string) {
  return shortcut.replace(
    "Mod+",
    navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl+",
  );
}
