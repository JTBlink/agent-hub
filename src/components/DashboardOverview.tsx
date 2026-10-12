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
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3.5"
      aria-label={t("dashboard.overview")}
      aria-busy={loading}
    >
      {cards.map((card) => (
        <DashboardOverviewCard
          key={card.id}
          card={card}
          loading={loading}
          onOpen={() => openLibrary(card.id)}
        />
      ))}
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
      className="app-panel group flex min-w-0 flex-col rounded-xl px-5 py-5 text-left transition-colors enabled:hover:border-accent-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span
          id={`dashboard-${card.id}-title`}
          className="min-w-0 text-sm font-medium text-secondary"
        >
          {card.title}
        </span>
        <span
          className={`shrink-0 rounded-md p-2 ${card.iconBackground} ${card.tone}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </span>
      <span
        id={`dashboard-${card.id}-count`}
        className="mt-5 text-3xl font-semibold leading-none tracking-tight text-primary tabular-nums"
      >
        {loading ? "—" : card.count}
      </span>
      <span
        id={`dashboard-${card.id}-hint`}
        className="mb-4 mt-3 flex-1 text-xs leading-relaxed text-tertiary"
      >
        {loading ? t("common.loading") : card.hint}
      </span>
      <span
        className={`flex w-full items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs ${card.disabled ? "text-muted" : card.tone}`}
      >
        {card.action}
        {!card.disabled && (
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        )}
      </span>
    </button>
  );
}
