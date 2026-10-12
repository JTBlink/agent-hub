import {
  CheckCircle2,
  ChevronRight,
  FolderPlus,
  Layers,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TFunction } from "i18next";
import type { ManagedSkill } from "../lib/tauri";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

import { DashboardLibraryArt } from "./DashboardLibraryArt";

type OverviewScope = "library" | "undeployed" | "ungrouped";
interface OverviewCard {
  id: OverviewScope;
  title: string;
  count: number;
  icon: LucideIcon;
  hint: string;
  action: string;
  tone: string;
  iconBackground: string;
  disabled: boolean;
  coverage?: number;
}

function overviewCards(
  managedSkills: ManagedSkill[],
  loading: boolean,
  t: TFunction,
): OverviewCard[] {
  const total = managedSkills.length;
  const undeployed = managedSkills.filter(
    (skill) => skill.targets.length === 0,
  ).length;
  const ungrouped = managedSkills.filter(
    (skill) => skill.skill_group_ids.length === 0,
  ).length;
  return [
    {
      id: "library",
      title: t("dashboard.librarySkills"),
      count: total,
      icon: Layers,
      hint:
        total > 0
          ? t("dashboard.deploymentSummary", {
              count: total - undeployed,
              percent: Math.round(((total - undeployed) / total) * 100),
            })
          : t("dashboard.libraryHint"),
      action: t("dashboard.viewLibrary"),
      tone: "text-accent-light",
      iconBackground: "bg-accent-bg",
      disabled: loading,
      coverage: total > 0 ? ((total - undeployed) / total) * 100 : 0,
    },
    {
      id: "undeployed",
      title: t("dashboard.pendingDeployment"),
      count: undeployed,
      icon: undeployed > 0 ? Send : CheckCircle2,
      hint: t(
        undeployed > 0
          ? "dashboard.pendingDeploymentHint"
          : "dashboard.noPendingDeployment",
      ),
      action: t("dashboard.reviewDeployment"),
      tone: "text-[var(--color-brand-teal)]",
      iconBackground: "bg-surface-hover",
      disabled: loading || undeployed === 0,
    },
    {
      id: "ungrouped",
      title: t("dashboard.pendingGrouping"),
      count: ungrouped,
      icon: ungrouped > 0 ? FolderPlus : CheckCircle2,
      hint: t(
        ungrouped > 0
          ? "dashboard.pendingGroupingHint"
          : "dashboard.noPendingGrouping",
      ),
      action: t("dashboard.organizeGroups"),
      tone: "text-[var(--color-brand-violet)]",
      iconBackground: "bg-surface-hover",
      disabled: loading || ungrouped === 0,
    },
  ];
}

export function DashboardOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    managedSkills,
    loading,
    setViewedSkillGroupId,
    setViewingUngrouped,
    closeSkillDetail,
  } = useApp();
  const cards = overviewCards(managedSkills, loading, t);
  const openLibrary = (id: OverviewScope) => {
    closeSkillDetail();
    setViewedSkillGroupId("");
    if (id === "ungrouped") setViewingUngrouped(true);
    navigate(
      id === "undeployed" ? "/my-skills?deployment=undeployed" : "/my-skills",
    );
  };

  return (
    <section
      className="dashboard-overview"
      aria-label={t("dashboard.overview")}
      aria-busy={loading}
    >
      <div className="dashboard-overview-grid">
        {cards.map((card) => (
          <DashboardOverviewCard
            key={card.id}
            card={card}
            loading={loading}
            onOpen={() => openLibrary(card.id)}
          />
        ))}
      </div>
    </section>
  );
}

function DashboardOverviewCard({
  card,
  loading,
  onOpen,
}: {
  card: OverviewCard;
  loading: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={card.disabled}
      aria-labelledby={`dashboard-${card.id}-title`}
      aria-describedby={`dashboard-${card.id}-count dashboard-${card.id}-hint`}
      className={`dashboard-stat dashboard-stat-${card.id === "library" ? "library" : "task"} group ${card.tone}`}
    >
      {card.id === "library" && <DashboardLibraryArt />}
      <span className="dashboard-stat-heading">
        <span
          id={`dashboard-${card.id}-title`}
          className="dashboard-stat-title"
        >
          {card.title}
        </span>
        <span className={`dashboard-stat-icon ${card.iconBackground}`}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </span>
      <span id={`dashboard-${card.id}-count`} className="dashboard-stat-count">
        {loading ? "—" : card.count}
      </span>
      <span id={`dashboard-${card.id}-hint`} className="dashboard-stat-hint">
        {loading ? t("common.loading") : card.hint}
      </span>
      {card.coverage !== undefined && (
        <span aria-hidden="true" className="dashboard-coverage">
          <span style={{ width: `${loading ? 0 : card.coverage}%` }} />
        </span>
      )}
      <span
        className={`dashboard-stat-action ${card.disabled ? "text-muted" : card.tone}`}
      >
        {card.action}
        {!card.disabled && (
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        )}
      </span>
    </button>
  );
}
