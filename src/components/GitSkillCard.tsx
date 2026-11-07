import {
  Check,
  DownloadCloud,
  Eye,
  GitBranch,
  Loader2,
  Square,
  SquareCheck,
  UploadCloud,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { GitSkillPreview } from "../lib/tauri";
import { compareDeclaredSkillVersions } from "../lib/skillVersions";
import { GitSkillVersionInfo } from "./GitSkillVersionInfo";

export function GitSkillCard({
  skill,
  source,
  installed,
  installedVersion,
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
  installedVersion?: string | null;
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
  const comparison = compareDeclaredSkillVersions(
    installedVersion,
    skill.version,
  );
  const action = !installed
    ? "installToLocal"
    : comparison === "central_newer"
      ? "uploadToRepository"
      : comparison === "source_newer" || otherSource
        ? "updateToLocal"
        : "viewDetails";
  const ActionIcon =
    action === "uploadToRepository"
      ? UploadCloud
      : action === "viewDetails"
        ? Eye
        : DownloadCloud;
  const actionLabel = t(`install.gitBrowser.${action}`);
  const actionTitle = `${actionLabel} · ${skill.name}`;
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
            className="min-w-0 truncate text-left text-sm font-semibold text-secondary hover:text-accent-light focus-visible:outline-accent"
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
            aria-label={actionTitle}
            title={actionTitle}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-[5px] border px-1.5 py-1 text-xs transition-colors focus-visible:outline-accent disabled:opacity-50",
              action === "uploadToRepository"
                ? "border-amber-500/30 bg-amber-500/10 text-warning hover:bg-amber-500/20"
                : action === "viewDetails"
                  ? "border-border-subtle text-tertiary hover:bg-surface-hover"
                  : "border-accent-border bg-accent-bg text-accent-light hover:bg-surface-active",
            )}
          >
            {busy ? (
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin"
              />
            ) : (
              <ActionIcon aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {actionLabel}
          </button>
        )}
      </div>
      {skill.description && (
        <p
          title={skill.description}
          className="line-clamp-2 text-xs leading-5 text-muted"
        >
          {skill.description}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1">
        <span
          title={source}
          className="max-w-full truncate rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-sm font-medium leading-4 text-accent-light"
        >
          {source}
        </span>
        {installed && (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-sm leading-4 text-emerald-700 dark:text-emerald-400">
            <Check aria-hidden="true" className="h-3 w-3" />
            {t(
              otherSource
                ? "install.gitBrowser.localExists"
                : "install.installed",
            )}
          </span>
        )}
      </div>
      <GitSkillVersionInfo
        repositoryVersion={skill.version}
        installedVersion={installedVersion}
        installed={installed}
      />
      <p title={skill.repo_path || "/"} className="truncate text-xs text-muted">
        {skill.repo_path || "/"}
      </p>
    </article>
  );
}
