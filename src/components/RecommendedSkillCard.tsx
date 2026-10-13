import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "../utils";
import type { RecommendedSkill } from "../lib/recommendedSkills";

interface RecommendedSkillCardProps {
  skill: RecommendedSkill;
  isInstalled: boolean;
  installing: boolean;
  onInstall: (skill: RecommendedSkill) => void;
}

export function RecommendedSkillCard({
  skill,
  isInstalled,
  installing,
  onInstall,
}: RecommendedSkillCardProps) {
  const { t } = useTranslation();
  const owner = skill.source.split("/")[0];
  const avatarUrl = `https://github.com/${owner}.png?size=32`;

  return (
    <div className="app-panel flex flex-col gap-2 p-3 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img
            src={avatarUrl}
            alt={owner}
            className="h-6 w-6 shrink-0 rounded-full border border-border-subtle"
            loading="lazy"
          />
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-secondary">
              {skill.name}
            </h3>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => openUrl(skill.install_url)}
            className="rounded-[5px] p-1 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
            title={t("install.viewOnGithub")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          {isInstalled ? (
            <span className="rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 p-1 text-emerald-400">
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : installing ? (
            <span className="rounded-[5px] border border-accent-border bg-accent-dark p-1 text-white">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          ) : (
            <button
              onClick={() => onInstall(skill)}
              className="rounded-[5px] border border-accent-border bg-accent-dark p-1 text-white transition-colors hover:bg-accent"
              title={t("install.oneClickInstall")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        {skill.description}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span
          className={cn(
            "rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-[13px] leading-4 font-medium text-accent-light",
          )}
        >
          @{skill.source}
        </span>
        <span className="rounded-[5px] border border-border-subtle bg-background px-1.5 py-0.5 text-[13px] leading-4 text-muted">
          {skill.tag}
        </span>
        {isInstalled && (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[13px] leading-4 font-medium text-emerald-400">
            <Check className="h-3 w-3" />
            {t("install.installed")}
          </span>
        )}
      </div>
    </div>
  );
}
