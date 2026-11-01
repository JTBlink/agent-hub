import { OpenProjectInVscode } from "./OpenProjectInVscode";
import { Link, useLocation, useMatch } from "react-router-dom";
import { CircleHelp, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { ThemedSelect } from "./ThemedSelect";
import { useWorkspaceSelection } from "../hooks/useWorkspaceSelection";
import { compactHomePath } from "../utils";
import { useDragWindow } from "../hooks/useDragWindow";

export function WindowTitleBar({
  onOpenCommands,
}: {
  onOpenCommands: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const projectRoute = useMatch("/project/:id/*");
  const { projects } = useApp();
  const onDrag = useDragWindow();
  const selection = useWorkspaceSelection(projects);
  const project = projects.find((item) => item.id === projectRoute?.params.id);
  const selectedProject = selection.project;
  const vscodePath = selection.path;
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
  const shortcut = navigator.userAgent.includes("Mac") ? "⌘K" : "Ctrl K";

  return (
    <header
      onMouseDown={onDrag}
      className="relative z-50 flex h-[var(--app-titlebar-height)] shrink-0 items-center justify-between gap-3 bg-bg-secondary pr-2 select-none"
      style={{ paddingLeft: "calc(80px / var(--app-scale))" }}
    >
      <div
        className="flex min-w-0 max-w-[55%] items-center text-sm text-muted"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ThemedSelect
          aria-label={t("worktree.selectCheckout")}
          title={
            selectedProject
              ? `${selection.selectedLabel}\n${compactHomePath(selection.path ?? selectedProject.path)}`
              : t("sidebar.switchProject")
          }
          value={selection.value}
          onChange={(event) => selection.select(event.target.value)}
          leadingIcon={
            <img
              src="/icons/32x32.png"
              alt=""
              className="h-3.5 w-3.5 shrink-0"
            />
          }
          className="h-6 min-w-0 gap-1.5 rounded border-transparent bg-transparent px-1 py-0 text-xs text-muted hover:bg-surface-hover hover:text-secondary"
        >
          {!selectedProject && (
            <option value="" disabled>
              {t("sidebar.switchProject")}
            </option>
          )}
          {selection.options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </ThemedSelect>
        {selectedProject && vscodePath && (
          <OpenProjectInVscode key={vscodePath} path={vscodePath} />
        )}
      </div>
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
      <Link
        to="/help"
        onMouseDown={(event) => event.stopPropagation()}
        title={t("help.pageTitle")}
        aria-label={t("help.pageTitle")}
        className="app-button-ghost shrink-0 rounded p-1"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </header>
  );
}
