import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../utils";

const tabs = ["agents", "skills", "appearance", "backup", "about"] as const;
type SettingsTab = (typeof tabs)[number];

export function SettingsTabs({
  agentCount,
  children,
}: {
  agentCount: number;
  children: Record<SettingsTab, ReactNode>;
}) {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const active = tabs.find((tab) => hash === `#${tab}`) ?? "agents";
  return (
    <>
      <div
        role="tablist"
        aria-label={t("settings.title")}
        className="flex shrink-0 gap-5 overflow-x-auto border-b border-border-subtle scrollbar-hide"
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
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
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
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
              tab === active
                ? "border-accent text-accent-light"
                : "border-transparent text-muted hover:text-primary",
            )}
          >
            {t(`settings.tabs.${tab}`)}
            {tab === "agents" && (
              <span className="rounded bg-surface-active px-1.5 py-0.5 text-[11px] tabular-nums">
                {agentCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab}
          id={`settings-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          tabIndex={0}
          hidden={tab !== active}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-8 pt-5 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {children[tab]}
        </div>
      ))}
    </>
  );
}
