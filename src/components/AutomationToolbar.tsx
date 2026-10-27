import { ThemedSelect } from "./ThemedSelect";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RefObject } from "react";
import type { AutomationTaskOrigin } from "../lib/tauri";
import type { AutomationSourceFilter } from "../lib/automation";
import { ToggleSwitch } from "./ToggleSwitch";

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
  shown: number;
  hiddenCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const origins = ["all", "agent_hub", "external"] as const;
  const sources: AutomationSourceFilter[] = hermesInstalled
    ? ["all", "system", "hermes"]
    : ["all", "system"];
  return (
    <div className="space-y-4">
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
          value={origin}
          onChange={(e) => {
            const value = origins.find((option) => option === e.target.value);
            if (value) onOrigin(value);
          }}
          aria-label={t("automation.originFilter")}
          className="app-input"
        >
          {origins.map((value) => (
            <option key={value} value={value}>
              {t(
                value === "all"
                  ? "automation.allOrigins"
                  : `automation.origins.${value}`,
              )}
            </option>
          ))}
        </ThemedSelect>
        <ThemedSelect
          value={source}
          onChange={(e) => {
            const value = sources.find((option) => option === e.target.value);
            if (value) onSource(value);
          }}
          aria-label={t("automation.sourceFilter")}
          className="app-input"
        >
          {sources.map((value) => (
            <option key={value} value={value}>
              {t(
                value === "all"
                  ? "automation.allSources"
                  : `automation.filters.${value}`,
              )}
            </option>
          ))}
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
