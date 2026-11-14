import { useContext } from "react";
import { SidebarVisibilityContext } from "../../../hooks/sidebarVisibility";
import { useHerdrFollowProject } from "./useHerdrFollowProject";

/** Explicit checkout selection activates the existing Herdr follow/attachment owner. */
export function useHerdrWorkspaceSelection() {
  const follow = useHerdrFollowProject();
  const sidebar = useContext(SidebarVisibilityContext);
  return () => {
    if (follow.enabled) sidebar?.openSidebarPanel?.("herdr");
    return follow.enabled;
  };
}
