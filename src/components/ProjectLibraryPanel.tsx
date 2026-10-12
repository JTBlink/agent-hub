import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectLibraryStatus } from "../lib/tauri";
import { needsTeamRefresh } from "../lib/projectSkillEntries";
import { ProjectSharingFiles } from "./ProjectSharingFiles";
import { cn } from "../utils";

/** Project-wide guidance stays compact; skill actions live on their cards. */
export function ProjectLibraryPanel({
  status,
  error,
  onRetry,
}: {
  status: ProjectLibraryStatus | null;
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const management = new Set(status?.management_files);
  const sharedCount =
    status?.files_to_commit.filter((path) => !management.has(path)).length ?? 0;
  const ignoredCount =
    status?.ignored_paths.filter((path) => !management.has(path)).length ?? 0;
  const refreshCount = status?.skills.filter(needsTeamRefresh).length ?? 0;
  const warningCount = ignoredCount + refreshCount;
  const summaryTone = error
    ? "text-danger"
    : warningCount > 0
      ? "text-amber-600 dark:text-amber-400"
      : "text-secondary";

  return (
    <details className="group/sharing mb-3 rounded-lg border border-border-subtle bg-surface text-[12px] text-muted">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border [&::-webkit-details-marker]:hidden",
          summaryTone,
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open/sharing:rotate-90"
        />
        <span className="min-w-0 truncate font-medium">
          {t("projectLibrary.sharingDetails")}
        </span>
        <span
          className="min-w-0 flex-1 truncate"
          title={t("projectLibrary.centralHelp")}
        >
          <code>.agents/skills</code>
          {sharedCount > 0 &&
            ` · ${t("projectLibrary.commitFiles", { count: sharedCount })}`}
        </span>
        {warningCount > 0 && (
          <span
            className="shrink-0 text-amber-600 dark:text-amber-400"
            title={t("projectLibrary.warningSummaryHelp", {
              ignored: ignoredCount,
              refresh: refreshCount,
            })}
          >
            {t("projectLibrary.warningSummary", { count: warningCount })}
          </span>
        )}
        {error && (
          <span className="shrink-0 text-danger">
            {t("projectLibrary.errorSummary", { count: 1 })}
          </span>
        )}
      </summary>
      <div className="border-t border-border-subtle px-4 py-3">
        <p>{t("projectLibrary.description")}</p>
        {error && (
          <div role="alert" className="mt-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="ml-2 text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
            >
              {t("common.refresh")}
            </button>
          </div>
        )}
        {status && <ProjectSharingFiles status={status} />}
      </div>
    </details>
  );
}
