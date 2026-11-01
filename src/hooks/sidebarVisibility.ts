import { createContext } from "react";
export const SidebarVisibilityContext = createContext<{
  resourcePanelVisible: boolean;
  sidebarContainer?: HTMLDivElement | null;
  statusContainer?: HTMLDivElement | null;
  branchContainer?: HTMLDivElement | null;
  setResourcePanelVisible: (visible: boolean) => void;
} | null>(null);
