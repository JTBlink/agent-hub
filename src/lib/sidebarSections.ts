export type SidebarSection = "skills" | "agents" | "projects";

/** Every agent detail route belongs to the single global workspace section. */
export function activeSidebarSection(pathname: string): SidebarSection | null {
  if (pathname === "/my-skills") return "skills";
  if (/^\/(global|lobster)-workspace(?:\/|$)/.test(pathname)) return "agents";
  if (/^\/project\//.test(pathname)) return "projects";
  return null;
}
