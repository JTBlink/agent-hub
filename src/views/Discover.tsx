import { Box, CalendarClock, GitBranch, Star, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { InstallSkills } from "./InstallSkills";
import { AutomationDiscovery } from "../components/discovery/AutomationDiscovery";
import { cn } from "../utils";

const kinds = ["skills", "automations"] as const;
const skillSources = ["recommended", "market", "local", "git"] as const;
const taskSources = ["recommended", "local", "git"] as const;
export type DiscoverySource = (typeof skillSources)[number];
const sourceIcons = {
  recommended: Star,
  market: Box,
  local: UploadCloud,
  git: GitBranch,
};
const sourceLabels = {
  recommended: "install.recommended",
  market: "install.browseMarket",
  local: "install.localInstall",
  git: "install.gitInstall",
};

/** Content type and source have independent URLs; old /install?tab= links remain valid. */
export function Discover() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const kind = params.get("type") === "automations" ? "automations" : "skills";
  const skillsSource =
    skillSources.find(
      (s) =>
        s ===
        (params.get("tab") ??
          (kind === "skills" ? params.get("source") : null)),
    ) ?? "market";
  const tasksSource =
    taskSources.find(
      (s) =>
        s ===
        (params.get("automationSource") ??
          (kind === "automations" ? params.get("source") : null)),
    ) ?? "recommended";
  const selectKind = (value: typeof kind) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("type", value);
      next.set("tab", skillsSource);
      next.set("automationSource", tasksSource);
      next.delete("source");
      return next;
    });
  const selectSource = (value: DiscoverySource) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(kind === "skills" ? "tab" : "automationSource", value);
      next.delete("source");
      return next;
    });
  const sources = (active: boolean) => (
    <div
      aria-label={t("discovery.sources")}
      className="discovery-source-toolbar mb-3 flex flex-wrap items-center gap-1"
    >
      {(active ? skillSources : taskSources).map((source) => {
        const Icon = sourceIcons[source];
        const selected = (active ? skillsSource : tasksSource) === source;
        return (
          <button
            type="button"
            key={source}
            aria-pressed={selected}
            onClick={() => selectSource(source)}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              selected
                ? "bg-surface-active text-accent-light"
                : "text-muted hover:bg-surface-hover hover:text-primary",
            )}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {t(sourceLabels[source])}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="app-page discovery-page">
      <header className="discovery-editor-header">
        <h1 className="sr-only">{t("discovery.title")}</h1>
        <div
          role="tablist"
          aria-label={t("discovery.title")}
          className="workbench-editor-tabs"
        >
          {kinds.map((value, index) => {
            const Icon = value === "skills" ? Box : CalendarClock;
            return (
              <button
                key={value}
                id={`discover-${value}`}
                type="button"
                role="tab"
                aria-selected={kind === value}
                aria-controls={`discover-panel-${value}`}
                tabIndex={kind === value ? 0 : -1}
                onClick={() => selectKind(value)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 1
                        : event.key === "ArrowRight"
                          ? (index + 1) % 2
                          : event.key === "ArrowLeft"
                            ? (index + 1) % 2
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  selectKind(kinds[next]);
                  document.getElementById(`discover-${kinds[next]}`)?.focus();
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                  kind === value
                    ? "text-primary"
                    : "text-muted hover:text-primary",
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {value === "skills" ? "Skills" : t("discovery.automations")}
              </button>
            );
          })}
        </div>
      </header>
      <section
        className="min-w-0"
        hidden={kind !== "skills"}
        role="tabpanel"
        id="discover-panel-skills"
        aria-labelledby="discover-skills"
      >
        {sources(true)}
        <InstallSkills activeTab={skillsSource} active={kind === "skills"} />
      </section>
      <section
        className="min-w-0"
        hidden={kind !== "automations"}
        role="tabpanel"
        id="discover-panel-automations"
        aria-labelledby="discover-automations"
      >
        {sources(false)}
        <AutomationDiscovery
          source={tasksSource}
          active={kind === "automations"}
        />
      </section>
    </div>
  );
}
