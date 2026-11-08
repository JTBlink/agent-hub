import { createContext } from "react";
import type { SidebarPanelRequest } from "../lib/sidebarSections";
export const SidebarVisibilityContext = createContext<{
  resourcePanelVisible: boolean;
  setGitSidebarVisible?: (visible: boolean) => void;
  sidebarContainer?: HTMLDivElement | null;
  statusContainer?: HTMLDivElement | null;
  branchContainer?: HTMLDivElement | null;
  setResourcePanelVisible: (visible: boolean) => void;
  panelRequest?: SidebarPanelRequest | null;
  openSidebarPanel?: (panel: string, view?: string) => void;
} | null>(null);
