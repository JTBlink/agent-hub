import { useState } from "react";
import {
  activeSidebarSection,
  type SidebarSection,
} from "../lib/sidebarSections";

/** Navigation opens its section unless the caller preserves the current sidebar. */
export function useSidebarSections(
  pathname: string,
  preserveSelection = false,
) {
  const [selection, setSelection] = useState<{
    pathname: string;
    section: SidebarSection | null;
  }>({ pathname, section: activeSidebarSection(pathname) });
  if (selection.pathname !== pathname) {
    setSelection({
      pathname,
      section: preserveSelection
        ? selection.section
        : activeSidebarSection(pathname),
    });
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
