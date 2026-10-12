import { enabledInstalledAgents } from "../lib/agentAvailability";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layers, Plus, Download, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { AgentControlSetupCard } from "../components/AgentControlSetupCard";
import { AgentIcon } from "../components/AgentIcon";
import { DashboardWorkspaces } from "../components/DashboardWorkspaces";
import { DashboardOverview } from "../components/DashboardOverview";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tools, projects, managedSkills, openSkillDetailById } = useApp();
  const enabledAgents = useMemo(() => enabledInstalledAgents(tools), [tools]);
  const recentSkills = useMemo(
    () =>
      [...managedSkills]
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5),
    [managedSkills],
  );

  return (
    <div className="app-page app-page-narrow">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-border-subtle pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            {t("dashboard.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-tertiary">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/install?tab=local" className="app-button-secondary">
            <Download aria-hidden="true" className="h-4 w-4" />
            {t("dashboard.scanImport")}
          </Link>
          <Link to="/install" className="app-button-primary">
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("dashboard.installNew")}
          </Link>
        </div>
      </header>
      <AgentControlSetupCard />
      <DashboardOverview />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section
          className="app-panel min-w-0 overflow-hidden"
          aria-labelledby="recent-skills-title"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <h2
              id="recent-skills-title"
              className="text-sm font-semibold text-primary"
            >
              {t("dashboard.recentActivity")}
            </h2>
            <Link
              to="/my-skills"
              className="inline-flex items-center gap-1 rounded text-xs text-accent-light hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("dashboard.viewLibrary")}
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentSkills.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {recentSkills.map((skill) => {
                const targets = [
                  ...new Set(skill.targets.map((target) => target.tool)),
                ];
                return (
                  <button
                    type="button"
                    key={skill.id}
                    onClick={() => {
                      openSkillDetailById(skill.id);
                      navigate("/my-skills");
                    }}
                    className="group flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-border bg-accent-bg text-base font-semibold text-accent-light"
                    >
                      {skill.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className="truncate text-sm font-medium text-secondary"
                          title={skill.name}
                        >
                          {skill.name}
                        </span>
                        <span className="rounded border border-border-subtle bg-background px-1.5 py-0.5 text-[11px] text-muted">
                          {skill.source_type}
                        </span>
                      </span>
                      <span className="mt-1.5 block truncate text-xs leading-relaxed text-muted">
                        {skill.description || t("dashboard.noDescription")}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={
                            targets.length > 0
                              ? "text-xs text-[var(--color-brand-teal)]"
                              : "text-xs text-muted"
                          }
                        >
                          {targets.length > 0
                            ? t("dashboard.deployedTo", {
                                count: targets.length,
                              })
                            : t("dashboard.notSynced")}
                        </span>
                        {targets.slice(0, 4).map((tool) => (
                          <AgentIcon
                            key={tool}
                            agentKey={tool}
                            displayName={
                              tools.find((agent) => agent.key === tool)
                                ?.display_name ?? tool
                            }
                            className="h-4 w-4"
                          />
                        ))}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-muted group-hover:text-accent-light"
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 px-5 py-8">
              <Layers
                aria-hidden="true"
                className="h-7 w-7 text-accent-light"
              />
              <h3 className="text-sm font-medium text-secondary">
                {t("dashboard.emptyTitle")}
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                {t("dashboard.emptyBody")}
              </p>
              <Link to="/install?tab=local" className="app-button-secondary">
                {t("dashboard.scanImport")}
              </Link>
            </div>
          )}
        </section>
        <DashboardWorkspaces agents={enabledAgents} projects={projects} />
      </div>
    </div>
  );
}
