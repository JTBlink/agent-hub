import { OpenProjectInVscode } from "./OpenProjectInVscode";
import { Link, useLocation, useMatch } from "react-router-dom";
import { CircleHelp, RefreshCw, Search, Settings, Trash2 } from "lucide-react";
import { useState, Fragment, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { ThemedSelect } from "./ThemedSelect";
import { useWorkspaceSelection } from "../hooks/useWorkspaceSelection";
import { recentProjects } from "../lib/recentProjects";
import { compactHomePath } from "../utils";
import { useDragWindow } from "../hooks/useDragWindow";
import type { Project } from "../lib/tauri";
import { RemoveProjectDialog } from "./worktree/RemoveProjectDialog";
import { WorktreeCheckoutSwitcher } from "./worktree/WorktreeCheckoutSwitcher";

import {
  useWorkbench,
  workbenchShortcutLabel,
  workbenchModules,
  type BuiltinModule,
} from "../app/product/workbench";
import { featureModules } from "@app/features";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import "@vscode/codicons/dist/codicon.css";

export function WindowTitleBar({
  onOpenCommands,
  onRefresh,
}: {
  onOpenCommands: () => void;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const { layout, shortcuts } = useWorkbench();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const { pathname } = useLocation();
  const projectRoute = useMatch("/project/:id/*");
  const { projects } = useApp();
  const [removeTarget, setRemoveTarget] = useState<Project | null>(null);
  const onDrag = useDragWindow();
  const selection = useWorkspaceSelection(projects);
  const project = projects.find((item) => item.id === projectRoute?.params.id);
  const selectedProject = selection.project;
  const vscodePath = selection.path;
  const recent = recentProjects(projects, selectedProject?.id);
  const pageTitles: Record<string, string> = {
    "/": t("sidebar.dashboard"),
    "/tasks": t("tasks.title"),
    "/automation": t("automation.title"),
    "/git": "Git",
    "/my-skills": t("sidebar.mySkills"),
    "/discover": t("discovery.title"),
    "/install": t("discovery.title"),
    "/backup": t("sidebar.backup"),
    "/settings": t("sidebar.settings"),
    "/terminal": t("terminal.title"),
    "/help": t("help.pageTitle"),
    "/global-workspace": t("sidebar.globalWorkspace"),
    "/lobster-workspace": t("sidebar.globalWorkspace"),
  };
  const title =
    project?.name ??
    pageTitles[pathname] ??
    pageTitles[`/${pathname.split("/")[1]}`] ??
    t("app.name");
  const shortcut = workbenchShortcutLabel(shortcuts.commands);

  const items = {
    workspace: (
      <div
        className="flex min-w-0 max-w-[55%] items-center gap-1 text-sm text-muted"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ThemedSelect
          fitContent
          aria-label={t("sidebar.switchProject")}
          title={
            selectedProject
              ? compactHomePath(selectedProject.path)
              : t("sidebar.openProjectHint")
          }
          value={selectedProject?.id ?? ""}
          disabled={!projects.length}
          optionAction={(id) => {
            const target = projects.find((item) => item.id === id);
            return target
              ? {
                  label: t("worktree.removeProject", { name: target.name }),
                  icon: <Trash2 size={14} aria-hidden="true" />,
                  onSelect: () => setRemoveTarget(target),
                }
              : undefined;
          }}
          onChange={(event) => {
            const next = projects.find(
              (item) => item.id === event.target.value,
            );
            if (next && next.id !== selectedProject?.id)
              selection.openWorktree(next.id, next.path);
          }}
          leadingIcon={
            <img
              src="/icons/app-mark.svg"
              alt=""
              draggable={false}
              className="h-5 w-5 shrink-0"
            />
          }
          className="h-6 min-w-0 gap-1.5 rounded border-transparent bg-transparent px-1 py-0 text-xs text-muted hover:bg-surface-hover hover:text-secondary"
        >
          {!selectedProject && <option value="">{t("app.name")}</option>}
          {recent.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </ThemedSelect>
        {selectedProject && <WorktreeCheckoutSwitcher />}
        {selectedProject && vscodePath && (
          <OpenProjectInVscode key={vscodePath} path={vscodePath} />
        )}
      </div>
    ),
    commands: (
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onOpenCommands}
        aria-label={t("titleBar.searchCommands")}
        title={`${t("commandPalette.placeholder")} (${shortcut})`}
        className="mx-auto flex h-6 w-[38%] max-w-[400px] min-w-0 flex-1 items-center gap-2 rounded-md border border-border-subtle bg-surface/60 px-2 text-xs text-muted transition-colors hover:border-border hover:bg-surface-hover hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Search className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-center">{title}</span>
        <kbd
          className="shrink-0 font-sans text-xs text-faint"
          aria-hidden="true"
        >
          {shortcut}
        </kbd>
      </button>
    ),
    help: (
      <Link
        to="/help"
        onMouseDown={(event) => event.stopPropagation()}
        title={t("help.pageTitle")}
        aria-label={t("help.pageTitle")}
        className="app-button-ghost shrink-0 rounded p-1"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    ),
    settings: (
      <Link
        to="/settings"
        onMouseDown={(event) => event.stopPropagation()}
        title={t("sidebar.settings")}
        aria-label={t("sidebar.settings")}
        className="app-button-ghost shrink-0 rounded p-1"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    ),
    refresh: (
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onRefresh}
        title={t("common.refresh")}
        aria-label={t("common.refresh")}
        className="app-button-ghost shrink-0 rounded p-1"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    ),
  };
  const renderModule = (slot: string) => {
    const id = slot.slice(7);
    const feature = featureModules.find((entry) => entry.id === id);
    const builtin = Object.hasOwn(workbenchModules, id)
      ? workbenchModules[id as BuiltinModule]
      : undefined;
    const itemClass = "app-button-ghost shrink-0 rounded p-1";
    const title = feature
      ? t(feature.sidebar.labelKey)
      : builtin && "label" in builtin
        ? t(builtin.label)
        : id;
    const Icon = feature?.sidebar.icon;
    const icon = Icon ? (
      <Icon className="h-3.5 w-3.5" />
    ) : builtin && "icon" in builtin ? (
      <span aria-hidden="true" className={`codicon codicon-${builtin.icon}`} />
    ) : null;
    const stopDrag = (event: React.MouseEvent) => event.stopPropagation();
    if (builtin && "path" in builtin)
      return (
        <Link
          to={builtin.path}
          onMouseDown={stopDrag}
          aria-label={title}
          title={title}
          className={itemClass}
        >
          {icon}
        </Link>
      );
    return (
      <button
        type="button"
        onMouseDown={stopDrag}
        aria-label={title}
        title={title}
        className={itemClass}
        onClick={() => sidebarVisibility?.openSidebarPanel?.(id)}
      >
        {icon}
      </button>
    );
  };
  return (
    <>
      <header
        onMouseDown={onDrag}
        className="relative z-50 flex h-[var(--app-titlebar-height)] shrink-0 items-center justify-between gap-3 bg-bg-secondary pr-2 select-none"
        style={{ paddingLeft: "calc(80px / var(--app-scale))" }}
      >
        {layout.toolbar.map((id) => (
          <Fragment key={id}>
            {Object.hasOwn(items, id)
              ? items[id as keyof typeof items]
              : id.startsWith("module:")
                ? renderModule(id)
                : null}
          </Fragment>
        ))}
      </header>
      <RemoveProjectDialog
        project={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
    </>
  );
}
