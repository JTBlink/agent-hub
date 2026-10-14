import { ProjectSkillEntryIssues } from "./ProjectSkillEntryIssues";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectLibraryStatus } from "../lib/tauri";
import { needsTeamRefresh } from "../lib/projectSkillEntries";

/** Team entry maintenance belongs to the matching skill, in either view. */
export function ProjectSkillTeamStatus({
  status,
  repairing,
  disabled,
  onRepair,
}: {
  status: ProjectLibraryStatus["skills"][number] | undefined;
  repairing: boolean;
  disabled: boolean;
  onRepair?: (directory: string) => void;
}) {
  const { t } = useTranslation();
  if (!status || !needsTeamRefresh(status)) return null;
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-accent-bg px-2 py-1.5 text-[12px] text-accent-light">
      <span>{t("projectLibrary.stale")}</span>
      {onRepair && (
        <button
          type="button"
          title={t("projectLibrary.repairHelp")}
          aria-label={t("projectLibrary.repair")}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onRepair(status.directory);
          }}
          className="inline-flex items-center gap-1 rounded py-0.5 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:cursor-wait disabled:opacity-50"
        >
          {repairing ? (
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="h-3 w-3" />
          )}
          {t("projectLibrary.repair")}
        </button>
      )}
      <ProjectSkillEntryIssues status={status} />
    </div>
  );
}
