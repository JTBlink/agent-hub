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
      className="mb-4 flex flex-wrap gap-1 border-b border-border-subtle"
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
              "mr-4 flex items-center gap-1.5 border-b-2 px-1 pb-1.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              selected
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-tertiary",
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
    <div className="app-page gap-4">
      <header className="app-page-header border-b-0 pb-0">
        <h1 className="app-page-title mb-4">{t("discovery.title")}</h1>
        <div
          role="tablist"
          aria-label={t("discovery.title")}
          className="flex gap-5 border-b border-border-subtle"
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
                  "flex items-center gap-1.5 border-b-2 px-1 pb-2 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  kind === value
                    ? "border-accent text-accent-light"
                    : "border-transparent text-muted hover:text-primary",
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
        hidden={kind !== "skills"}
        role="tabpanel"
        id="discover-panel-skills"
        aria-labelledby="discover-skills"
      >
        {sources(true)}
        <InstallSkills activeTab={skillsSource} active={kind === "skills"} />
      </section>
      <section
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
