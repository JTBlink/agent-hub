import type { Dispatch, SetStateAction } from "react";
import {
  isTerminalTabVisible,
  type TerminalTab,
} from "../../lib/terminalLayout";

/** Log visibility belongs to the tab UI; the service's launch object stays unchanged. */
export function useDevelopmentTabs(
  tabs: TerminalTab[],
  activeId: string,
  setTabs: Dispatch<SetStateAction<TerminalTab[]>>,
  setActiveId: (id: string) => void,
) {
  const visibleTabs = tabs.filter(isTerminalTabVisible);
  const active =
    visibleTabs.find((tab) => tab.id === activeId) ?? visibleTabs.at(-1);
  return {
    visibleTabs,
    active,
    revealService: (tab: TerminalTab) => {
      if (tab.development)
        setTabs((previous) =>
          previous.map((item) =>
            item.id === tab.id ? { ...item, developmentVisible: true } : item,
          ),
        );
    },
    hideService: (tab: TerminalTab) => {
      setTabs((previous) =>
        previous.map((item) =>
          item.id === tab.id ? { ...item, developmentVisible: false } : item,
        ),
      );
      if (active?.id === tab.id)
        setActiveId(
          visibleTabs.filter((item) => item.id !== tab.id).at(-1)?.id ?? "",
        );
    },
  };
}
