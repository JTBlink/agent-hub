import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { GitBackupChange } from "../lib/tauri";

export function BackupPendingChanges({
  changes,
}: {
  changes: GitBackupChange[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (changes.length === 0) return null;

  const title = t("backup.changes.title", { count: changes.length });
  return (
    <div className="mt-4 min-w-0 border-t border-border-subtle pt-3">
      <h3 className="text-[12px] font-medium text-secondary">{title}</h3>
      <ul
        aria-label={title}
        tabIndex={0}
        className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border-subtle bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {changes.map((change) => (
          <li
            key={change.path}
            role="button"
            tabIndex={0}
            className="flex cursor-pointer items-start gap-3 border-b border-border-subtle px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-hover"
            onClick={() =>
              navigate(
                `/backup/diff?path=${encodeURIComponent(change.path)}`,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(
                  `/backup/diff?path=${encodeURIComponent(change.path)}`,
                );
              }
            }}
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] text-secondary">
              {change.previous_path && (
                <>
                  <span className="text-muted">{change.previous_path}</span>
                  {" → "}
                </>
              )}
              {change.path}
            </span>
            <span className="shrink-0 rounded bg-surface-active px-1.5 py-0.5 text-[11px] text-tertiary">
              {t(`backup.changes.${change.kind}`)}
            </span>
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}
