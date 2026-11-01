import { ArrowUpRight, TerminalSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Project, ToolInfo } from "../lib/tauri";
import { touchProjectVisited } from "../lib/tauri";
import { lastWorkspace } from "../lib/lastWorkspace";
import { worktreeUrl } from "../lib/worktreeApi";
import { compactHomePath } from "../utils";
import { DashboardLibraryArt } from "./DashboardLibraryArt";
import { AgentIcon } from "./AgentIcon";

export function DashboardResume({
  projects,
  agents,
  loading,
}: {
  projects: Project[];
  agents: ToolInfo[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const workspace = lastWorkspace(projects);
  return (
    <section
      className="dashboard-resume"
      aria-labelledby="dashboard-resume-title"
      aria-busy={loading}
    >
      <div className="dashboard-resume-caption">
        <TerminalSquare size={16} aria-hidden="true" />
        <h2 id="dashboard-resume-title">{t("dashboard.resumeTitle")}</h2>
      </div>
      <div className="dashboard-resume-body">
        <div className="dashboard-resume-copy">
          <h3 title={workspace?.project.name}>
            {loading
              ? t("common.loading")
              : (workspace?.project.name ?? t("dashboard.startProject"))}
          </h3>
          <p title={workspace ? compactHomePath(workspace.path) : undefined}>
            {workspace
              ? compactHomePath(workspace.path)
              : t("dashboard.openProjectHint")}
          </p>
          {!loading && (
            <Link
              className="dashboard-resume-open"
              to={
                workspace
                  ? worktreeUrl(workspace.project.id, workspace.path)
                  : "/install"
              }
              onClick={() => {
                if (workspace)
                  void touchProjectVisited(workspace.project.id).catch(
                    () => {},
                  );
              }}
            >
              {t(workspace ? "dashboard.resumeAction" : "dashboard.installNew")}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          )}
        </div>
        <DashboardLibraryArt />
      </div>
      <div className="dashboard-resume-footer">
        <span>
          {workspace
            ? t("dashboard.projectSkills", {
                count: workspace.project.skill_count,
              })
            : t("dashboard.projectLocalHint")}
        </span>
        <div
          className="dashboard-agent-rail"
          aria-label={t("dashboard.availableAgents")}
        >
          <span>{t("dashboard.availableAgents")}</span>
          {agents.slice(0, 5).map((agent) => (
            <span key={agent.key} title={agent.display_name}>
              <AgentIcon
                agentKey={agent.key}
                displayName={agent.display_name}
                className="h-4 w-4"
              />
            </span>
          ))}
          {agents.length > 5 && <span>+{agents.length - 5}</span>}
          {agents.length === 0 && (
            <Link to="/settings#agents">{t("dashboard.manageAgents")}</Link>
          )}
        </div>
      </div>
    </section>
  );
}
