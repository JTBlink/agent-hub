import { Link, useLocation, useMatch } from "react-router-dom";
import { CircleHelp, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
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
  const project = projects.find((item) => item.id === projectRoute?.params.id);
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
      <div className="pointer-events-none flex min-w-0 items-center gap-1.5 text-sm text-muted">
        <img src="/icons/32x32.png" alt="" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{t("app.name")}</span>
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onOpenCommands}
        aria-label={t("titleBar.searchCommands")}
        title={`${t("commandPalette.placeholder")} (${shortcut})`}
        className="absolute left-1/2 flex h-6 w-[38%] max-w-[400px] min-w-0 -translate-x-1/2 items-center gap-2 rounded-md border border-border-subtle bg-surface/60 px-2 text-xs text-muted transition-colors hover:border-border hover:bg-surface-hover hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        className="app-button-ghost rounded p-1"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </header>
  );
}
