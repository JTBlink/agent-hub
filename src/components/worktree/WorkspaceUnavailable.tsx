import { FolderX, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { compactHomePath } from "../../utils";

/** Recovery state shared by the editor and its file sidebar. */
export function WorkspaceUnavailable({
  path,
  loading,
  onRetry,
  compact = false,
  missing = true,
  onOpenOther,
  opening = false,
  onRemove,
  checkingRemoval = false,
}: {
  path: string;
  loading: boolean;
  onRetry: () => void;
  compact?: boolean;
  missing?: boolean;
  onOpenOther?: () => void;
  opening?: boolean;
  onRemove?: () => void;
  checkingRemoval?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-busy={loading}
      className={
        compact
          ? "space-y-2 px-3 py-4 text-xs text-muted"
          : "flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
      }
    >
      <div
        className={
          compact ? "space-y-2" : "w-full max-w-md space-y-4 text-center"
        }
      >
        <FolderX
          aria-hidden="true"
          className={
            compact ? "h-5 w-5 text-muted" : "mx-auto h-10 w-10 text-muted"
          }
        />
        <h2
          className={
            compact
              ? "font-medium text-secondary"
              : "text-base font-semibold text-primary"
          }
        >
          {t(
            missing
              ? "worktree.missingDirectory.title"
              : "worktree.missingDirectory.accessTitle",
          )}
        </h2>
        <p className="text-xs leading-relaxed text-muted">
          {t(
            missing
              ? "worktree.missingDirectory.description"
              : "worktree.missingDirectory.accessDescription",
          )}
        </p>
        <p
          title={compactHomePath(path)}
          className="break-all rounded bg-bg-secondary px-2 py-1.5 font-mono text-xs text-muted"
        >
          {compactHomePath(path)}
        </p>
        <div
          className={
            compact
              ? "flex flex-wrap gap-2"
              : "flex flex-wrap justify-center gap-2"
          }
        >
          <button
            type="button"
            disabled={loading}
            className="app-button-secondary text-xs"
            onClick={onRetry}
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {t(
              loading
                ? "worktree.missingDirectory.checking"
                : "worktree.missingDirectory.retry",
            )}
          </button>
          {!compact && onOpenOther && (
            <button
              type="button"
              className="app-button-primary text-xs"
              disabled={opening}
              onClick={onOpenOther}
            >
              {t("worktree.missingDirectory.openOther")}
            </button>
          )}
          {!compact && onRemove && (
            <button
              type="button"
              className="app-button-ghost text-xs"
              disabled={checkingRemoval || loading}
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              {t("worktree.missingDirectory.removeInvalidProject")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
