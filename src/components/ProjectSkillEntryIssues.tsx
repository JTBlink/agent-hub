import { useTranslation } from "react-i18next";
import type { ProjectLibraryStatus } from "../lib/tauri";

export function ProjectSkillEntryIssues({
  status,
}: {
  status: ProjectLibraryStatus["skills"][number];
}) {
  const { t } = useTranslation();
  return (
    <div className="basis-full min-w-0 text-[12px] text-secondary">
      {status.stale_targets.length > 0 && (
        <p>{t("projectLibrary.entryIssuesHelp")}</p>
      )}
      {status.modified && <p>{t("projectLibrary.modifiedHelp")}</p>}
      {status.target_issues?.map((issue) => (
        <p key={issue.agent} className="break-words" title={issue.path}>
          {issue.agent_name ?? issue.agent}：
          {t(`projectLibrary.entryIssues.${issue.reason}`)}
        </p>
      ))}
      {!status.target_issues?.length && status.stale_targets.length > 0 && (
        <p>
          {t("projectLibrary.staleHelp", {
            agents: status.stale_targets.join("、"),
          })}
        </p>
      )}
    </div>
  );
}
