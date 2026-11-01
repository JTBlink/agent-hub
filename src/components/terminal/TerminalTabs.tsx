import { TabCloseButton } from "../TabCloseButton";
import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import type { TerminalTab } from "../../lib/terminalLayout";
import { cn } from "../../utils";

export function TerminalTabs({
  tabs,
  projects,
  activeId,
  scoped,
  onSelect,
  onClose,
}: {
  tabs: TerminalTab[];
  projects: Project[];
  activeId: string;
  scoped: boolean;
  onSelect: (tab: TerminalTab) => void;
  onClose: (tab: TerminalTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("terminal.sessions")}
      className="flex min-w-0 flex-1 overflow-x-auto"
    >
      {tabs.map((tab, index) => {
        const project = projects.find(
          (project) => project.id === tab.projectId,
        );
        return (
          <div
            key={tab.id}
            className={cn(
              "flex shrink-0 items-center rounded-t border-b-2",
              tab.id === activeId
                ? "border-accent bg-surface"
                : "border-transparent",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              className="h-8 max-w-48 truncate px-3 text-xs"
              title={project?.name}
              onClick={() => onSelect(tab)}
            >
              {(scoped ? t("terminal.title") : project?.name) ||
                t("terminal.title")}{" "}
              {index + 1}
            </button>
            <TabCloseButton
              aria-label={t("terminal.closeTab", { number: index + 1 })}
              title={t("terminal.closeTab", { number: index + 1 })}
              onClick={() => onClose(tab)}
            />
          </div>
        );
      })}
    </div>
  );
}
