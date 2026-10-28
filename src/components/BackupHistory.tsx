import { History, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitBackupVersion } from "../lib/tauri";
import { backupVersionLabel, formatDateTime } from "../lib/backupTime";
import { cn } from "../utils";

export function BackupHistory({
  versions,
  loading,
  isRepo,
  restoring,
  onRefresh,
  onRestore,
}: {
  versions: GitBackupVersion[];
  loading: boolean;
  isRepo: boolean;
  restoring: string | null;
  onRefresh: () => void;
  onRestore: (reference: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="app-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted" />
          <h2 className="text-[14px] font-semibold text-secondary">
            {t("backup.history.title")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || !isRepo}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          {t("settings.refresh")}
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-[13px] text-muted">
          {t("mySkills.gitVersionLoading")}
        </div>
      ) : versions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle py-6 text-center text-[13px] text-muted">
          {t("backup.history.empty")}
        </div>
      ) : (
        <div className="max-h-[360px] space-y-1.5 overflow-auto pr-1">
          {versions.map((version) => (
            <div
              key={version.tag}
              className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-secondary">
                  {t(
                    version.tag.startsWith("sm-v-")
                      ? "backup.history.snapshotTime"
                      : "backup.history.backupTime",
                    { time: backupVersionLabel(version) },
                  )}
                </div>
                <div className="truncate text-[12px] text-muted">
                  {version.message || version.commit}
                </div>
                <div className="text-[11px] text-faint">
                  {version.author ? `${version.author} · ` : ""}
                  {version.commit} ·{" "}
                  {t("backup.history.commitTime", {
                    time: formatDateTime(version.committed_at),
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRestore(version.tag)}
                disabled={!!restoring}
                className="shrink-0 rounded-lg border border-border-subtle px-2 py-1 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                {restoring === version.tag
                  ? t("mySkills.gitVersionRestoring")
                  : t("mySkills.gitVersionRestore")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
