import { createContext } from "react";
export const SidebarVisibilityContext = createContext<{
  resourcePanelVisible: boolean;
  sidebarContainer?: HTMLDivElement | null;
  statusContainer?: HTMLDivElement | null;
  setResourcePanelVisible: (visible: boolean) => void;
} | null>(null);
