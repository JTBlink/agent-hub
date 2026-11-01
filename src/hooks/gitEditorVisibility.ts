import { createContext } from "react";

/** Reports whether source control has content to show in the shared editor. */
export const GitEditorVisibilityContext = createContext<
  ((visible: boolean) => void) | null
>(null);

/** Mounts the selected Git file alongside terminal and workspace file tabs. */
export const GitEditorTabsContext = createContext<{
  container: HTMLDivElement | null;
  active: boolean;
  onSelect: () => void;
} | null>(null);
