import { ChevronRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ManagedSkill, ToolInfo } from "../lib/tauri";
import { AgentIcon } from "./AgentIcon";

interface DashboardRecentSkillsProps {
  skills: ManagedSkill[];
  tools: ToolInfo[];
  onOpenSkill: (id: string) => void;
  onOpenLibrary: () => void;
}

export function DashboardRecentSkills({
  skills,
  tools,
  onOpenSkill,
  onOpenLibrary,
}: DashboardRecentSkillsProps) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0" aria-labelledby="recent-skills-title">
      <div className="dashboard-section-heading">
        <h2 id="recent-skills-title">{t("dashboard.recentActivity")}</h2>
        <Link
          to="/my-skills"
          onClick={onOpenLibrary}
          className="rounded text-xs text-accent-light hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("dashboard.viewLibrary")}
        </Link>
      </div>
      <div
        className={
          skills.length > 0 ? "dashboard-recent-grid" : "dashboard-recent-list"
        }
      >
        {skills.length > 0 ? (
          skills.map((skill) => (
            <RecentSkillCard
              key={skill.id}
              skill={skill}
              tools={tools}
              onOpen={() => onOpenSkill(skill.id)}
            />
          ))
        ) : (
          <div className="flex flex-col items-start gap-3 px-6 py-8">
            <span className="rounded-xl bg-accent-bg p-3 text-accent-light">
              <Layers aria-hidden="true" className="h-6 w-6" />
            </span>
            <h3 className="text-sm font-medium text-secondary">
              {t("dashboard.emptyTitle")}
            </h3>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              {t("dashboard.emptyBody")}
            </p>
            <Link
              to="/install?tab=local"
              className="app-button-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("dashboard.scanImport")}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function RecentSkillCard({
  skill,
  tools,
  onOpen,
}: {
  skill: ManagedSkill;
  tools: ToolInfo[];
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const targets = [...new Set(skill.targets.map((target) => target.tool))];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="dashboard-skill-card group"
    >
      <span aria-hidden="true" className="dashboard-skill-mark">
        {skill.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="truncate text-sm font-medium text-secondary"
            title={skill.name}
          >
            {skill.name}
          </span>
          <span className="text-xs text-muted">
            {t(`mySkills.sourceFilter.${skill.source_type}`, {
              defaultValue: skill.source_type,
            })}
          </span>
        </span>
        <span
          className="dashboard-skill-description"
          title={skill.description || undefined}
        >
          {skill.description || t("dashboard.noDescription")}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={
              targets.length > 0
                ? "text-xs dashboard-deployment-state"
                : "text-xs text-muted"
            }
          >
            {targets.length > 0
              ? t("dashboard.deployedTo", { count: targets.length })
              : t("mySkills.filterPanel.undeployed")}
          </span>
          {targets.slice(0, 4).map((tool) => (
            <AgentIcon
              key={tool}
              agentKey={tool}
              displayName={
                tools.find((agent) => agent.key === tool)?.display_name ?? tool
              }
              className="h-4 w-4"
            />
          ))}
        </span>
      </span>
      <span className="dashboard-skill-action">
        {t("dashboard.viewSkillDetail")}
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
