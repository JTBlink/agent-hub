import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, ChevronRight } from "lucide-react";
import type { GitBackupChange } from "../lib/tauri";

export function BackupPendingChanges({
  changes,
}: {
  changes: GitBackupChange[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (changes.length === 0) return null;

  return (
    <div className="mt-4 min-w-0 border-t border-border-subtle pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-secondary">
          {t("backup.changes.title", { count: changes.length })}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => navigate("/backup/diff", { state: { changes } })}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
          {t("backup.changes.viewDiff")}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
      </div>
      <ul
        className="max-h-48 space-y-1 overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        tabIndex={0}
        aria-label={t("backup.changes.title", { count: changes.length })}
      >
        {changes.map((change) => (
          <li
            key={change.path}
            className="flex items-start gap-2 rounded-md border border-border-subtle px-2 py-1.5 text-[12px]"
          >
            <span className="shrink-0 text-tertiary">
              {t(`backup.changes.${change.kind}`)}
            </span>
            <span className="min-w-0 break-all font-mono text-secondary">
              {change.previous_path && <>{change.previous_path} → </>}
              {change.path}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
