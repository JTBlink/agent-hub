import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { gitBackupFileDiff } from "../lib/tauri";
import type { GitBackupFileDiff } from "../lib/tauri";
import { DocumentDiffViewer } from "../components/DocumentDiffViewer";

const STATUS_TONE: Record<string, string> = {
  added:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  deleted:
    "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  modified:
    "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  renamed:
    "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  conflicted:
    "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
};

export default function BackupDiff() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const path = params.get("path") ?? "";

  const [diff, setDiff] = useState<GitBackupFileDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!path) {
      setError("No file path specified");
      setLoading(false);
      return;
    }
    setLoading(true);
    gitBackupFileDiff(path)
      .then(setDiff)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [path]);

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => navigate("/backup")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("backup.changes.backToBackup")}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="app-page-title">
            {t("backup.changes.diffTitle")}
          </h1>
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-12 text-[13px] text-muted">
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {diff && (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3 py-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[diff.status] ?? ""}`}
            >
              {t(`backup.changes.${diff.status}`)}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-secondary"
              title={diff.path}
            >
              {diff.path}
            </span>
          </div>

          {diff.content_kind === "text" ? (
            <DocumentDiffViewer
              original={diff.original_text ?? ""}
              updated={diff.updated_text ?? ""}
              className="!space-y-0 !rounded-none !border-0"
            />
          ) : (
            <div className="px-4 py-6 text-center text-[13px] text-muted">
              {t(
                diff.content_kind === "binary"
                  ? "backup.changes.binaryFile"
                  : "backup.changes.tooLarge",
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
