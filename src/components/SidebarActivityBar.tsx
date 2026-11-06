import { Fragment, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import "@vscode/codicons/dist/codicon.css";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { featureModules } from "@app/features";
import { productConfig } from "@app/product";
import { activeSidebarPanel, type SidebarPanel } from "../lib/sidebarSections";

type ActivityIcon =
  | "files"
  | "search"
  | "layout"
  | "checklist"
  | "clock"
  | "source-control"
  | "layers"
  | "extensions"
  | "cloud"
  | "globe"
  | "settings-gear";

function ActivityBarIcon({ name }: { name: ActivityIcon }) {
  return (
    <span
      className={`codicon codicon-${name} activity-bar-icon`}
      aria-hidden="true"
    />
  );
}

export function SidebarActivityBar({
  panelOpen,
  panelId,
  selectedPanel,
  manualSelection,
  onSelectPanel,
  updateVersion,
  gitChanges,
  gitSidebarOpen,
  onSelectGit,
}: {
  panelOpen: boolean;
  panelId: string;
  selectedPanel: SidebarPanel;
  manualSelection: boolean;
  onSelectPanel: (panel: SidebarPanel) => void;
  updateVersion?: string;
  gitChanges?: { count: number; truncated: boolean };
  gitSidebarOpen: boolean;
  onSelectGit: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const routePanel = activeSidebarPanel(pathname);
  const panelActive = routePanel !== null || (panelOpen && manualSelection);
  const itemClass =
    "activity-bar-item relative isolate flex w-full shrink-0 items-center justify-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";
  const activeClass = "activity-bar-item-active text-primary";
  const idleClass = "text-muted hover:text-primary";
  const renderLink = (item: {
    name: string;
    path: string;
    icon: ActivityIcon;
    update?: boolean;
  }) => {
    const active =
      !panelActive &&
      (pathname === item.path ||
        (item.path === "/discover" && pathname === "/install"));
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-expanded={
          item.path === "/git"
            ? pathname === "/git" && gitSidebarOpen
            : undefined
        }
        onClick={
          item.path === "/git"
            ? (event) => {
                if (pathname !== "/git") return;
                event.preventDefault();
                onSelectGit();
              }
            : undefined
        }
        title={item.name}
        aria-label={item.name}
        aria-current={active ? "page" : undefined}
        className={cn(itemClass, active ? activeClass : idleClass)}
      >
        <ActivityBarIcon name={item.icon} />
        <span className="sr-only">{item.name}</span>
        {item.path === "/git" && gitChanges && gitChanges.count > 0 && (
          <span
            role="status"
            aria-label={t(
              gitChanges.truncated
                ? "git.changedFilesTruncated"
                : "git.changedFiles",
              { count: gitChanges.count },
            )}
            title={t(
              gitChanges.truncated
                ? "git.changedFilesTruncated"
                : "git.changedFiles",
              { count: gitChanges.count },
            )}
            className="activity-bar-count absolute flex items-center justify-center rounded-full bg-accent text-white tabular-nums"
          >
            {gitChanges.count > 999
              ? "999+"
              : `${gitChanges.count}${gitChanges.truncated ? "+" : ""}`}
          </span>
        )}
        {item.update && updateVersion && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400"
            role="status"
            aria-label={t("settings.updateAvailable", {
              version: updateVersion,
            })}
          />
        )}
      </Link>
    );
  };

  const renderPanel = (
    panel: SidebarPanel,
    label: string,
    icon: ActivityIcon | ComponentType<{ className?: string }>,
  ) => {
    const Icon = typeof icon === "string" ? null : icon;
    const active = panelActive && selectedPanel === panel;
    return (
      <button
        type="button"
        data-sidebar-panel={panel}
        title={label}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        aria-expanded={panelOpen && selectedPanel === panel}
        aria-controls={panelId}
        onClick={() => onSelectPanel(panel)}
        className={cn(itemClass, active ? activeClass : idleClass)}
      >
        {typeof icon === "string" ? (
          <ActivityBarIcon name={icon} />
        ) : (
          Icon && <Icon className="activity-bar-icon" />
        )}
      </button>
    );
  };

  const items: Record<string, () => ReactNode> = {
    projects: () => renderPanel("projects", t("sidebar.projects"), "files"),
    search: () => renderPanel("search", t("workspaceSearch.title"), "search"),
    git: () =>
      renderLink({ name: "Git", path: "/git", icon: "source-control" }),
    tasks: () =>
      renderLink({ name: t("tasks.title"), path: "/tasks", icon: "checklist" }),
    automation: () =>
      renderLink({
        name: t("automation.title"),
        path: "/automation",
        icon: "clock",
      }),
    preview: () =>
      renderLink({ name: t("preview.title"), path: "/preview", icon: "globe" }),
    skills: () => renderPanel("skills", t("sidebar.skillPanel"), "layers"),
    discover: () =>
      renderLink({
        name: t("discovery.title"),
        path: "/discover",
        icon: "extensions",
      }),
    dashboard: () =>
      renderLink({ name: t("sidebar.dashboard"), path: "/", icon: "layout" }),
    backup: () =>
      renderLink({ name: t("sidebar.backup"), path: "/backup", icon: "cloud" }),
    settings: () =>
      renderLink({
        name: t("sidebar.settings"),
        path: "/settings",
        icon: "settings-gear",
        update: true,
      }),
  };
  for (const feature of featureModules) {
    items[feature.id] = () =>
      renderPanel(
        feature.sidebar.id,
        t(feature.sidebar.labelKey),
        feature.sidebar.icon,
      );
  }
  const renderItem = (id: string) => {
    const render = items[id];
    return render ? (
      <span key={id} className="contents">
        {render()}
      </span>
    ) : null;
  };
  const primary = productConfig.sidebar.primary.filter((id) => items[id]);
  const section = (id: string) =>
    ["projects", "search", "git"].includes(id)
      ? "workspace"
      : ["tasks", "automation", "preview"].includes(id)
        ? "work"
        : "tools";
  return (
    <nav
      aria-label={t("sidebar.navigation")}
      className="workbench-activity-bar flex shrink-0 flex-col bg-bg-secondary"
    >
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        {primary.map((id, index) => (
          <Fragment key={id}>
            {index > 0 && section(id) !== section(primary[index - 1]) && (
              <div aria-hidden="true" className="activity-bar-divider" />
            )}
            {renderItem(id)}
          </Fragment>
        ))}
      </div>
      <div className="shrink-0">
        <div aria-hidden="true" className="activity-bar-divider" />
        {productConfig.sidebar.bottom.map(renderItem)}
      </div>
    </nav>
  );
}
