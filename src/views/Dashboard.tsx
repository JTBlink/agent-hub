import { enabledInstalledAgents } from "../lib/agentAvailability";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { AgentControlSetupCard } from "../components/AgentControlSetupCard";
import { DashboardRecentSkills } from "../components/DashboardRecentSkills";
import "../styles/dashboard.css";
import { DashboardWorkspaces } from "../components/DashboardWorkspaces";
import { DashboardOverview } from "../components/DashboardOverview";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    tools,
    projects,
    managedSkills,
    openSkillDetailById,
    setViewedSkillGroupId,
    closeSkillDetail,
  } = useApp();
  const enabledAgents = useMemo(() => enabledInstalledAgents(tools), [tools]);
  const recentSkills = useMemo(
    () =>
      [...managedSkills]
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5),
    [managedSkills],
  );

  return (
    <div className="app-page app-page-narrow dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            {t("dashboard.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-tertiary">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/install?tab=local"
            className="app-button-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {t("dashboard.scanImport")}
          </Link>
          <Link
            to="/install"
            className="app-button-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("dashboard.installNew")}
          </Link>
        </div>
      </header>
      <AgentControlSetupCard />
      <DashboardOverview />
      <div className="dashboard-content">
        <DashboardWorkspaces agents={enabledAgents} projects={projects} />
        <DashboardRecentSkills
          skills={recentSkills}
          tools={tools}
          onOpenSkill={(id) => {
            setViewedSkillGroupId("");
            openSkillDetailById(id);
            navigate("/my-skills");
          }}
          onOpenLibrary={() => {
            closeSkillDetail();
            setViewedSkillGroupId("");
          }}
        />
      </div>
    </div>
  );
}
