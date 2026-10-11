import { Link } from "react-router-dom";
import { Bot, ChevronRight, FolderOpen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "./AgentIcon";
import type { Project, ToolInfo } from "../lib/tauri";

interface DashboardWorkspacesProps {
  agents: ToolInfo[];
  projects: Project[];
}

export function DashboardWorkspaces({
  agents,
  projects,
}: DashboardWorkspacesProps) {
  const { t } = useTranslation();
  return (
    <aside className="flex min-w-0 flex-col gap-5">
      <section
        className="app-panel overflow-hidden"
        aria-labelledby="dashboard-agents"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
          <h2
            id="dashboard-agents"
            className="flex items-center gap-2 text-sm font-semibold text-primary"
          >
            <Bot aria-hidden="true" className="h-4 w-4 text-accent-light" />
            {t("dashboard.connectedAgents")}
          </h2>
          <Link
            to="/settings#agents"
            className="rounded text-xs text-accent-light hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t("dashboard.manageAgents")}
          </Link>
        </div>
        {agents.length > 0 ? (
          <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto p-4">
            {agents.map((agent) => (
              <Link
                key={agent.key}
                to={`/${agent.category === "lobster" ? "lobster" : "global"}-workspace/${agent.key}`}
                className="inline-flex max-w-full items-center gap-2 rounded-md border border-border-subtle bg-background px-2.5 py-2 text-xs text-secondary transition-colors hover:border-accent-border hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <AgentIcon
                  agentKey={agent.key}
                  displayName={agent.display_name}
                  className="h-5 w-5"
                />
                <span className="truncate" title={agent.display_name}>
                  {agent.display_name}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 py-5 text-sm leading-relaxed text-muted">
            {t("dashboard.noAgents")}
          </p>
        )}
      </section>
      <section
        className="app-panel overflow-hidden"
        aria-labelledby="dashboard-projects"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3.5">
          <h2
            id="dashboard-projects"
            className="flex items-center gap-2 text-sm font-semibold text-primary"
          >
            <FolderOpen
              aria-hidden="true"
              className="h-4 w-4 text-accent-light"
            />
            {t("dashboard.projects")}
          </h2>
          <span className="text-xs tabular-nums text-muted">
            {projects.length}
          </span>
        </div>
        {projects.length > 0 ? (
          <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/project/${project.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
                >
                  <FolderOpen
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13px] font-medium text-secondary"
                      title={project.name}
                    >
                      {project.name}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {t("dashboard.projectSkills", {
                        count: project.skill_count,
                      })}
                    </p>
                  </div>
                  {project.sync_health.diverged > 0 && (
                    <span className="rounded bg-danger-bg px-1.5 py-1 text-xs text-danger">
                      {t("dashboard.conflicts", {
                        count: project.sync_health.diverged,
                      })}
                    </span>
                  )}
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex gap-3 px-4 py-5">
            <Plus
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-muted"
            />
            <p className="text-sm leading-relaxed text-muted">
              {t("dashboard.noProjects")}
            </p>
          </div>
        )}
      </section>
    </aside>
  );
}
