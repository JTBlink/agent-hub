import type { ReactNode } from "react";
import { TerminalSquare } from "lucide-react";
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
  children,
}: {
  children?: ReactNode;
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
      className="flex h-full min-w-0 flex-1 overflow-x-auto"
    >
      {tabs.map((tab, index) => {
        const project = projects.find(
          (project) => project.id === tab.projectId,
        );
        return (
          <div
            key={tab.id}
            className={cn(
              "flex h-full shrink-0 items-center border-b-2",
              tab.id === activeId
                ? "border-accent text-primary"
                : "border-transparent text-muted",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              className="flex h-full max-w-48 items-center gap-1.5 px-3 text-xs"
              title={project?.name}
              onClick={() => onSelect(tab)}
            >
              <TerminalSquare size={13} className="shrink-0" />
              <span className="truncate">
                {(scoped ? t("terminal.title") : project?.name) ||
                  t("terminal.title")}{" "}
                {index + 1}
              </span>
            </button>
            <TabCloseButton
              aria-label={t("terminal.closeTab", { number: index + 1 })}
              title={t("terminal.closeTab", { number: index + 1 })}
              onClick={() => onClose(tab)}
            />
          </div>
        );
      })}
      {children}
    </div>
  );
}
