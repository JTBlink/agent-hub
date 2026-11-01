import { createContext } from "react";

/** Reports whether source control has content to show in the shared editor. */
export const GitEditorVisibilityContext = createContext<
  ((visible: boolean) => void) | null
>(null);
