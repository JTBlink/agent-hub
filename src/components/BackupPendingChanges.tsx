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
      <button
        type="button"
        className="inline-flex w-full items-center gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => navigate("/backup/diff", { state: { changes } })}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="flex-1 text-left">
          {t("backup.changes.title", { count: changes.length })}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
    </div>
  );
}
