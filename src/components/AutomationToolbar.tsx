import { ThemedSelect } from "./ThemedSelect";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RefObject } from "react";
import type { AutomationTask, AutomationTaskOrigin } from "../lib/tauri";
import type { AutomationSourceFilter } from "../lib/automation";
import { ToggleSwitch } from "./ToggleSwitch";
import { cn } from "../utils";

export type AutomationOriginFilter = "all" | AutomationTaskOrigin;
export function AutomationToolbar({
  query,
  onQuery,
  source,
  onSource,
  status,
  onStatus,
  origin,
  onOrigin,
  hideBuiltin,
  onToggleBuiltin,
  hermesInstalled,
  tasks,
  shown,
  hiddenCount,
  searchRef,
}: {
  query: string;
  onQuery: (value: string) => void;
  source: AutomationSourceFilter;
  onSource: (value: AutomationSourceFilter) => void;
  status: string;
  onStatus: (value: string) => void;
  origin: AutomationOriginFilter;
  onOrigin: (value: AutomationOriginFilter) => void;
  hideBuiltin: boolean;
  onToggleBuiltin: () => void;
  hermesInstalled: boolean;
  tasks: AutomationTask[];
  shown: number;
  hiddenCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const origins = ["all", "agent_hub", "external"] as const;
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label={t("automation.originFilter")}
        className="flex flex-wrap gap-5 border-b border-border-subtle"
      >
        {origins.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={origin === value}
            onClick={() => onOrigin(value)}
            className={cn(
              "inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              origin === value
                ? "border-accent text-primary"
                : "border-transparent text-muted hover:text-primary",
            )}
          >
            {t(
              value === "all"
                ? "automation.filters.all"
                : `automation.origins.${value}`,
            )}
            <span className="rounded bg-surface-active px-1.5 text-[11px] tabular-nums text-muted">
              {value === "all"
                ? tasks.length
                : tasks.filter((task) => task.origin === value).length}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label={t("automation.search")}
            placeholder={t("automation.search")}
            className="app-input w-full pl-9"
          />
        </label>
        <ThemedSelect
          value={source}
          onChange={(e) =>
            onSource(
              e.target.value === "hermes"
                ? "hermes"
                : e.target.value === "system"
                  ? "system"
                  : "all",
            )
          }
          aria-label={t("automation.sourceFilter")}
          className="app-input"
        >
          <option value="all">{t("automation.allSources")}</option>
          <option value="system">{t("automation.filters.system")}</option>
          {hermesInstalled && <option value="hermes">Hermes</option>}
        </ThemedSelect>
        <ThemedSelect
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          aria-label={t("automation.statusFilter")}
          className="app-input"
        >
          <option value="all">{t("automation.allStatuses")}</option>
          {["active", "running", "paused", "completed", "error", "unknown"].map(
            (value) => (
              <option key={value} value={value}>
                {t(`automation.states.${value}`)}
              </option>
            ),
          )}
        </ThemedSelect>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            checked={hideBuiltin}
            onChange={onToggleBuiltin}
            title={t("automation.hideBuiltin")}
          />
          <span>{t("automation.hideBuiltin")}</span>
        </div>
        <p role="status">
          {t("automation.shownCount", { count: shown })}
          {hiddenCount > 0 && (
            <span className="ml-3">
              {t("automation.builtinHidden", { count: hiddenCount })}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
