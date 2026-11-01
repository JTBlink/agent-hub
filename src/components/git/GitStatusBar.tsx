import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitStatus } from "../../lib/gitApi";

export function GitStatusBar({
  branch,
  status,
}: {
  branch: string;
  status?: GitStatus;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-xs text-muted">
      <span className="flex min-w-0 items-center gap-1" title={branch}>
        <GitBranch size={12} className="shrink-0" />
        <span className="max-w-[200px] truncate">{branch}</span>
      </span>
      {status?.upstream && (
        <span className="max-w-[220px] truncate" title={status.upstream}>
          {status.upstream}
        </span>
      )}
      {status?.ahead != null && (
        <span title={t("git.cachedRefs")}>
          ↑ {status.ahead} ↓ {status.behind}
        </span>
      )}
      {status && status.state !== "Clean" && (
        <span className="text-danger" title={t("git.operation")}>
          {status.state}
        </span>
      )}
      <span className="ml-auto" title={t("git.cachedRefs")}>
        {t("git.localRefs")}
      </span>
    </div>
  );
}
