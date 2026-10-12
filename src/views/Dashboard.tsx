import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Layers,
  CheckCircle2,
  Bot,
  Plus,
  Download,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { AgentControlSetupCard } from "../components/AgentControlSetupCard";
import { AgentIcon } from "../components/AgentIcon";
import { DashboardWorkspaces } from "../components/DashboardWorkspaces";
import { UndeployedSkillsDialog } from "../components/UndeployedSkillsDialog";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tools, projects, managedSkills, openSkillDetailById } = useApp();
  const [showUndeployed, setShowUndeployed] = useState(false);
  const enabledAgents = useMemo(
    () => tools.filter((tool) => tool.installed && tool.enabled),
    [tools],
  );
  const undeployedSkills = useMemo(
    () => managedSkills.filter((skill) => skill.targets.length === 0),
    [managedSkills],
  );
  const divergedCount = useMemo(
    () =>
      projects.reduce(
        (count, project) => count + project.sync_health.diverged,
        0,
      ),
    [projects],
  );
  const recentSkills = useMemo(
    () =>
      [...managedSkills]
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5),
    [managedSkills],
  );
  const totalSkills = managedSkills.length;
  const syncedSkills = totalSkills - undeployedSkills.length;
  const coverage =
    totalSkills > 0 ? Math.round((syncedSkills / totalSkills) * 100) : 0;
  const stats = [
    {
      id: "library",
      href: "/my-skills",
      title: t("dashboard.librarySkills"),
      value: String(totalSkills),
      icon: Layers,
      detail: t("dashboard.libraryHint"),
      tone: "text-accent-light",
      iconBackground: "bg-accent-bg",
    },
    {
      id: "deployment",
      href: "/my-skills",
      title: t("dashboard.deployed"),
      value: `${syncedSkills}/${totalSkills}`,
      icon: divergedCount > 0 ? AlertTriangle : CheckCircle2,
      detail:
        divergedCount > 0
          ? t("dashboard.conflicts", { count: divergedCount })
          : t("dashboard.coverage", { percent: coverage }),
      tone:
        divergedCount > 0 ? "text-danger" : "text-[var(--color-brand-teal)]",
      iconBackground: divergedCount > 0 ? "bg-danger-bg" : "bg-surface-hover",
    },
    {
      id: "agents",
      href: "/settings#agents",
      title: t("dashboard.connectedAgents"),
      value: String(enabledAgents.length),
      icon: Bot,
      detail: t("dashboard.agentsHint"),
      tone: "text-[var(--color-brand-violet)]",
      iconBackground: "bg-surface-hover",
    },
  ];

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
      <section
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-3"
        aria-label={t("dashboard.overview")}
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.id}
              className="app-panel group flex min-w-0 flex-col transition-colors hover:border-accent-border"
            >
              <Link
                to={stat.href}
                className="flex flex-1 flex-col gap-5 rounded-xl px-5 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-secondary">
                    {stat.title}
                  </p>
                  <span
                    className={`rounded-md p-2 ${stat.iconBackground} ${stat.tone}`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                </div>
                <div>
                  <p className="text-3xl font-semibold leading-none tracking-tight text-primary tabular-nums">
                    {stat.value}
                  </p>
                  <p className={`mt-3 text-xs leading-relaxed ${stat.tone}`}>
                    {stat.detail}
                  </p>
                </div>
              </Link>
              {stat.id === "deployment" && (
                <button
                  type="button"
                  onClick={() => setShowUndeployed(true)}
                  disabled={undeployedSkills.length === 0}
                  aria-haspopup="dialog"
                  className="mx-5 mb-4 flex items-center justify-between gap-2 rounded border-t border-border-subtle pt-3 text-xs text-accent-light hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted disabled:no-underline"
                >
                  <span>
                    {t("dashboard.undeployedCount", {
                      count: undeployedSkills.length,
                    })}
                  </span>
                  {undeployedSkills.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      {t("dashboard.viewUndeployed")}
                      <ChevronRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </section>
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
      <UndeployedSkillsDialog
        open={showUndeployed}
        skills={undeployedSkills}
        onClose={() => setShowUndeployed(false)}
        onOpenSkill={(skillId) => {
          setShowUndeployed(false);
          openSkillDetailById(skillId);
          navigate("/my-skills");
        }}
      />
    </div>
  );
}
