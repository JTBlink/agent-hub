import type { ReactNode } from "react";
import { TabCloseButton } from "../TabCloseButton";
import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import type { TerminalTab } from "../../lib/terminalLayout";
import { cn } from "../../utils";
import { herdrAgentLabel } from "../../features/herdr/lib/herdrAgents";
import { terminalTabName } from "../../lib/terminalTabName";
import { TerminalTabButton } from "./TerminalTabButton";

export function TerminalTabs({
  tabs,
  projects,
  activeId,
  scoped,
  onSelect,
  onClose,
  onRename,
  children,
}: {
  children?: ReactNode;
  tabs: TerminalTab[];
  projects: Project[];
  activeId: string;
  scoped: boolean;
  onSelect: (tab: TerminalTab) => void;
  onClose: (tab: TerminalTab) => void;
  onRename?: (tab: TerminalTab, name: string) => void;
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
            <TerminalTabButton
              name={
                terminalTabName(tab) ??
                `${(tab.agent ? herdrAgentLabel(tab.agent) : scoped ? t("terminal.title") : project?.name) || t("terminal.title")} ${index + 1}`
              }
              selected={tab.id === activeId}
              onSelect={() => onSelect(tab)}
              onRename={onRename ? (name) => onRename(tab, name) : undefined}
            />
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
