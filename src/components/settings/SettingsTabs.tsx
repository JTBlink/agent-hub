import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../utils";
import { ResizableSidebar } from "../ResizableSidebar";

const tabs = [
  "agents",
  "skills",
  "appearance",
  "backup",
  "network",
  "hosts",
  "permissions",
  "about",
] as const;
type SettingsTab = (typeof tabs)[number];

export function SettingsTabs({
  agentCount,
  children,
}: {
  agentCount: number;
  children: Record<SettingsTab, ReactNode>;
}) {
  const { t } = useTranslation();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const { hash } = useLocation();
  const navigate = useNavigate();
  const active = tabs.find((tab) => hash === `#${tab}`) ?? "agents";
  const sidebar = (
    <ResizableSidebar
      storageKey="agent-hub:settings-sidebar-width"
      label={t("settings.title")}
      reserveWidth={360}
      hidden={sidebarVisibility?.resourcePanelVisible}
      className="workbench-sidebar-panel mr-1"
    >
      <header className="flex h-9 shrink-0 items-center px-3">
        <h2 className="truncate text-xs font-semibold text-secondary">
          {t("settings.title")}
        </h2>
      </header>
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={t("settings.title")}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            id={`settings-tab-${tab}`}
            role="tab"
            aria-selected={tab === active}
            aria-controls={`settings-panel-${tab}`}
            tabIndex={tab === active ? 0 : -1}
            onClick={() => {
              if (tab !== active) navigate({ hash: `#${tab}` });
            }}
            onKeyDown={(event) => {
              const index = tabs.indexOf(tab);
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowUp"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              navigate({ hash: `#${tabs[next]}` });
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              buttons?.[next]?.focus();
            }}
            className={cn(
              "flex min-w-0 shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
              tab === active
                ? "bg-surface-active font-medium text-primary"
                : "text-tertiary hover:bg-surface-hover hover:text-secondary",
            )}
          >
            <span
              className="min-w-0 flex-1 truncate"
              title={t(`settings.tabs.${tab}`)}
            >
              {t(`settings.tabs.${tab}`)}
            </span>
            {tab === "agents" && (
              <span className="rounded bg-surface-active px-1.5 py-0.5 text-xs tabular-nums">
                {agentCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </ResizableSidebar>
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      {sidebarVisibility?.sidebarContainer
        ? createPortal(sidebar, sidebarVisibility.sidebarContainer)
        : sidebar}
      {tabs.map((tab) => (
        <div
          key={tab}
          id={`settings-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          tabIndex={0}
          hidden={tab !== active}
          className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pb-4 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {children[tab]}
        </div>
      ))}
    </div>
  );
}
