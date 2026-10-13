import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronRight, FolderOpen, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "./AgentIcon";
import type { Project, ToolInfo } from "../lib/tauri";
import { touchProjectVisited } from "../lib/tauri";

interface DashboardWorkspacesProps {
  agents: ToolInfo[];
  projects: Project[];
}
type WorkspaceType = "agents" | "projects";

export function DashboardWorkspaces({
  agents,
  projects,
}: DashboardWorkspacesProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<WorkspaceType>("projects");
  const [query, setQuery] = useState("");
  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => (b.visited_at ?? 0) - (a.visited_at ?? 0)),
    [projects],
  );
  const entries = type === "agents" ? agents : sortedProjects;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (name: string) =>
    name.toLocaleLowerCase().includes(normalizedQuery);
  const switchType = (nextType: WorkspaceType) => {
    setType(nextType);
    setQuery("");
  };
  return (
    <section
      className="dashboard-workspaces"
      aria-labelledby="dashboard-workspaces-title"
    >
      <div className="dashboard-section-heading">
        <h2 id="dashboard-workspaces-title">{t("dashboard.workspaces")}</h2>
        {type === "agents" && (
          <Link
            to="/settings#agents"
            className="rounded text-xs text-accent-light hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t("dashboard.manageAgents")}
          </Link>
        )}
      </div>
      <WorkspaceSwitcher
        type={type}
        agentCount={agents.length}
        projectCount={projects.length}
        onChange={switchType}
      />
      {(entries.length > 4 || query) && (
        <WorkspaceSearch query={query} onChange={setQuery} />
      )}
      <div
        id="dashboard-workspace-entries"
        className="dashboard-workspace-grid"
        aria-label={t(
          type === "agents"
            ? "dashboard.agentWorkspaces"
            : "dashboard.projects",
        )}
      >
        {entries.length === 0 ? (
          <p className="dashboard-workspace-empty">
            {t(
              type === "agents" ? "dashboard.noAgents" : "dashboard.noProjects",
            )}
          </p>
        ) : !entries.some((entry) =>
            matches("display_name" in entry ? entry.display_name : entry.name),
          ) ? (
          <p className="dashboard-workspace-empty" role="status">
            {t("dashboard.noWorkspaceMatches")}
          </p>
        ) : type === "agents" ? (
          agents
            .filter((agent) => matches(agent.display_name))
            .map((agent) => (
              <AgentWorkspaceLink key={agent.key} agent={agent} />
            ))
        ) : (
          sortedProjects
            .filter((project) => matches(project.name))
            .map((project) => (
              <ProjectWorkspaceLink key={project.id} project={project} />
            ))
        )}
      </div>
    </section>
  );
}

function WorkspaceSwitcher({
  type,
  agentCount,
  projectCount,
  onChange,
}: {
  type: WorkspaceType;
  agentCount: number;
  projectCount: number;
  onChange: (type: WorkspaceType) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="dashboard-workspace-switch"
      role="group"
      aria-label={t("dashboard.workspaceTypes")}
    >
      <button
        type="button"
        aria-pressed={type === "projects"}
        aria-controls="dashboard-workspace-entries"
        onClick={() => onChange("projects")}
      >
        <FolderOpen aria-hidden="true" className="h-4 w-4" />
        {t("dashboard.projects")}
        <span>{projectCount}</span>
      </button>
      <button
        type="button"
        aria-pressed={type === "agents"}
        aria-controls="dashboard-workspace-entries"
        onClick={() => onChange("agents")}
      >
        <Bot aria-hidden="true" className="h-4 w-4" />
        {t("dashboard.agentWorkspaces")}
        <span>{agentCount}</span>
      </button>
    </div>
  );
}

function WorkspaceSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (query: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="dashboard-workspace-search">
      <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
      <input
        type="search"
        aria-label={t("dashboard.searchWorkspaces")}
        placeholder={t("dashboard.searchWorkspaces")}
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
      {query && (
        <button
          type="button"
          aria-label={t("dashboard.clearWorkspaceSearch")}
          onClick={() => onChange("")}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function AgentWorkspaceLink({ agent }: { agent: ToolInfo }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/${agent.category === "lobster" ? "lobster" : "global"}-workspace/${agent.key}`}
      className="dashboard-workspace-link"
      title={t("dashboard.openWorkspace")}
    >
      <AgentIcon
        agentKey={agent.key}
        displayName={agent.display_name}
        className="h-6 w-6 shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-sm font-medium"
          title={agent.display_name}
        >
          {agent.display_name}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted"
      />
    </Link>
  );
}

function ProjectWorkspaceLink({ project }: { project: Project }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/project/${project.id}`}
      className="dashboard-workspace-link"
      onClick={() => void touchProjectVisited(project.id)}
    >
      <span className="rounded-lg bg-accent-bg p-2 text-accent-light">
        <FolderOpen aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-sm font-medium"
          title={project.name}
        >
          {project.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tertiary">
          {t("dashboard.projectSkills", { count: project.skill_count })}
          {project.sync_health.diverged > 0 && (
            <span className="rounded bg-danger-bg px-1.5 py-0.5 text-danger">
              {t("dashboard.conflicts", {
                count: project.sync_health.diverged,
              })}
            </span>
          )}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted"
      />
    </Link>
  );
}
