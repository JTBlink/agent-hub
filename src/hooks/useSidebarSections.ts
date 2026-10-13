import { useState } from "react";
import {
  activeSidebarSection,
  type SidebarSection,
} from "../lib/sidebarSections";

/** Manual expansion applies to the current route; navigation opens its section. */
export function useSidebarSections(pathname: string) {
  const [selection, setSelection] = useState<{
    pathname: string;
    section: SidebarSection | null;
  }>({ pathname, section: activeSidebarSection(pathname) });
  if (selection.pathname !== pathname) {
    setSelection({ pathname, section: activeSidebarSection(pathname) });
  }
  const expandedSection =
    selection.pathname === pathname
      ? selection.section
      : activeSidebarSection(pathname);

  const toggleSection = (section: SidebarSection) => {
    setSelection({
      pathname,
      section: expandedSection === section ? null : section,
    });
  };

  return { expandedSection, toggleSection };
}
