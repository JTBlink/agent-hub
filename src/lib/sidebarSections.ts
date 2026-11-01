export type SidebarSection = "skills" | "agents" | "projects";

/** Every agent detail route belongs to the single global workspace section. */
export function activeSidebarSection(pathname: string): SidebarSection | null {
  if (pathname === "/my-skills") return "skills";
  if (/^\/(global|lobster)-workspace(?:\/|$)/.test(pathname)) return "agents";
  if (pathname === "/terminal" || /^\/project\//.test(pathname))
    return "projects";
  return null;
}

export type SidebarPanel = "projects" | "skills" | "search" | "herdr";
export function activeSidebarPanel(pathname: string): SidebarPanel | null {
  if (pathname === "/terminal" || activeSidebarSection(pathname) === "projects")
    return "projects";
  return activeSidebarSection(pathname) ? "skills" : null;
}
