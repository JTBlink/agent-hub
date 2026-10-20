import {
  Check,
  GitBranch,
  Loader2,
  Link2,
  Plus,
  Square,
  SquareCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { GitSkillPreview } from "../lib/tauri";

export function GitSkillCard({
  skill,
  source,
  installed,
  otherSource,
  busy,
  disabled,
  selecting,
  selected,
  onSelect,
  onInstall,
  onDetails,
}: {
  skill: GitSkillPreview;
  source: string;
  installed: boolean;
  otherSource: boolean;
  busy: boolean;
  disabled: boolean;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onDetails: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={cn(
        "app-panel flex min-w-0 flex-col gap-2 p-3 transition-colors hover:border-border",
        selected && "border-accent-border ring-1 ring-accent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-border bg-accent-bg text-accent-light">
            <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            onClick={onDetails}
            title={skill.name}
            className="min-w-0 truncate text-left text-[13px] font-semibold text-secondary hover:text-accent-light focus-visible:outline-accent"
          >
            {skill.name}
          </button>
        </div>
        {selecting && (!installed || otherSource) ? (
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={t("install.gitBrowser.selectSkill", {
              name: skill.name,
            })}
            className="app-button-ghost shrink-0 p-1"
          >
            {selected ? (
              <SquareCheck
                aria-hidden="true"
                className="h-4 w-4 text-accent-light"
              />
            ) : (
              <Square aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={installed ? onDetails : onInstall}
            disabled={disabled || busy}
            aria-label={t(
              installed
                ? "install.gitBrowser.viewSkill"
                : "install.gitBrowser.installSkill",
              { name: skill.name },
            )}
            className={cn(
              "shrink-0 rounded-[5px] border p-1 transition-colors disabled:opacity-50",
              installed
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                : "border-accent-border bg-accent-dark text-white hover:bg-accent",
            )}
          >
            {busy ? (
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin"
              />
            ) : otherSource ? (
              <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
            ) : installed ? (
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
      {skill.description && (
        <p
          title={skill.description}
          className="line-clamp-2 text-[12px] leading-5 text-muted"
        >
          {skill.description}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1">
        <span
          title={source}
          className="max-w-full truncate rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-[13px] font-medium leading-4 text-accent-light"
        >
          {source}
        </span>
        {installed && (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[13px] leading-4 text-emerald-700 dark:text-emerald-400">
            <Check aria-hidden="true" className="h-3 w-3" />
            {t(
              otherSource
                ? "install.gitBrowser.localExists"
                : "install.installed",
            )}
          </span>
        )}
      </div>
      <p
        title={skill.repo_path || "/"}
        className="truncate text-[12px] text-muted"
      >
        {skill.repo_path || "/"}
      </p>
    </article>
  );
}
