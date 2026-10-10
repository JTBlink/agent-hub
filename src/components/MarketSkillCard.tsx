import {
  DownloadCloud,
  ExternalLink,
  Check,
  Plus,
  Loader2,
  Link2,
  SquareCheck,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "../utils";
import type { SkillsShSkill } from "../lib/tauri";

interface MarketSkillCardProps {
  skill: SkillsShSkill;
  isMarketInstalled: boolean;
  isLocalMatch: boolean;
  installedFromSource?: string;
  isMultiSelect: boolean;
  isSelected: boolean;
  installing: string | null;
  batchLinking: boolean;
  marketSourceFilter: string;
  onToggleSelect: (id: string) => void;
  onInstall: (skill: SkillsShSkill) => void;
  onCancelInstall: (key: string) => void;
  onUninstall: (skill: SkillsShSkill) => void;
  onFilterSource: (source: string) => void;
}

export function MarketSkillCard({
  skill,
  isMarketInstalled,
  isLocalMatch,
  installedFromSource,
  isMultiSelect,
  isSelected,
  installing,
  batchLinking,
  marketSourceFilter,
  onToggleSelect,
  onInstall,
  onCancelInstall,
  onUninstall,
  onFilterSource,
}: MarketSkillCardProps) {
  const { t } = useTranslation();
  const displayName = skill.name || skill.skill_id;
  const showSkillId = skill.skill_id.trim() !== displayName.trim();
  const owner = skill.source.split("/")[0];
  const avatarUrl = `https://github.com/${owner}.png?size=32`;

  return (
    <div
      className={cn(
        "app-panel flex flex-col gap-2 p-3 transition-colors hover:border-border",
        isSelected && "ring-1 ring-accent border-accent/40",
      )}
      onClick={
        isMultiSelect && isLocalMatch
          ? () => onToggleSelect(skill.id)
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isMultiSelect && isLocalMatch ? (
            <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              {isSelected ? (
                <SquareCheck className="h-3.5 w-3.5 text-accent" />
              ) : (
                <Square className="h-3.5 w-3.5 text-faint" />
              )}
            </div>
          ) : null}
          <img
            src={avatarUrl}
            alt={owner}
            className="h-6 w-6 shrink-0 rounded-full border border-border-subtle"
            loading="lazy"
          />
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-secondary">
              {displayName}
            </h3>
            {showSkillId ? (
              <p className="truncate text-[13px] leading-4 text-muted">
                {skill.skill_id}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openUrl(`https://skills.sh/${skill.source}/${skill.skill_id}`);
            }}
            className="rounded-[5px] p-1 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
            title={t("install.viewOnWeb")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          {isMarketInstalled ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUninstall(skill);
              }}
              className="rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 p-1 text-emerald-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
              title={t("install.installed")}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          ) : installing === skill.id ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelInstall(`${skill.source}/${skill.skill_id}`);
              }}
              className="inline-flex items-center gap-1 rounded-[5px] border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-red-400 transition-colors hover:bg-red-500/20"
              title={t("install.cancel")}
              aria-label={t("install.cancel")}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-[11px] leading-none font-medium">
                {t("install.cancel")}
              </span>
            </button>
          ) : isLocalMatch ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInstall(skill);
              }}
              disabled={installing !== null || batchLinking}
              className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 p-1 text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
              title={t("install.linkToMarket")}
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInstall(skill);
              }}
              disabled={installing !== null || batchLinking}
              className="rounded-[5px] border border-accent-border bg-accent-dark p-1 text-white transition-colors hover:bg-accent disabled:opacity-50"
              title={t("install.oneClickInstall")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFilterSource(skill.source);
          }}
          disabled={marketSourceFilter === skill.source}
          title={t("install.onlyThisContributor")}
          className={cn(
            "rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-[13px] leading-4 font-medium text-accent-light transition-colors",
            marketSourceFilter === skill.source
              ? "cursor-default opacity-90"
              : "hover:bg-accent-bg/80",
          )}
        >
          @{skill.source}
        </button>
        {skill.installs > 0 && (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-border-subtle bg-background px-1.5 py-0.5 text-[13px] leading-4 text-muted">
            <DownloadCloud className="h-3 w-3" />
            {skill.installs >= 1_000_000
              ? `${(skill.installs / 1_000_000).toFixed(1)}M`
              : skill.installs >= 1_000
                ? `${(skill.installs / 1_000).toFixed(1)}K`
                : skill.installs}
          </span>
        )}
        {isMarketInstalled ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[13px] leading-4 font-medium text-emerald-400">
            <Check className="h-3 w-3" />
            {t("install.installed")}
          </span>
        ) : installedFromSource ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-border-subtle bg-background px-1.5 py-0.5 text-[13px] leading-4 text-muted">
            <Check className="h-3 w-3" />
            {t("install.installedFrom", { source: installedFromSource })}
          </span>
        ) : isLocalMatch ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[13px] leading-4 font-medium text-amber-400">
            <Link2 className="h-3 w-3" />
            {t("install.localMatch")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
