import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitBackupSizeReport } from "../lib/tauri";

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function BackupScope({
  sizeReport,
}: {
  sizeReport: GitBackupSizeReport | null;
}) {
  const { t } = useTranslation();
  return (
    <section className="app-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted" />
        <h2 className="text-[14px] font-semibold text-secondary">
          {t("backup.scope.title")}
        </h2>
      </div>
      <div className="space-y-2 text-[13px]">
        {["skills", "automations", "metadata"].map((key) => (
          <div key={key} className="flex items-start gap-2 text-tertiary">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span>{t(`backup.scope.included.${key}`)}</span>
          </div>
        ))}
        {["secrets", "local", "automationLocal"].map((key) => (
          <div key={key} className="flex items-start gap-2 text-muted">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
            <span>{t(`backup.scope.excluded.${key}`)}</span>
          </div>
        ))}
      </div>
      {sizeReport &&
      (sizeReport.oversized.length > 0 ||
        sizeReport.total_bytes > sizeReport.repo_warn_bytes) ? (
        <div className="mt-3 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-700 dark:text-amber-300">
          {sizeReport.total_bytes > sizeReport.repo_warn_bytes && (
            <div>
              {t("backup.scope.repoTooLarge", {
                size: formatBytes(sizeReport.total_bytes),
              })}
            </div>
          )}
          {sizeReport.oversized.map((skill) => (
            <div key={skill.name}>
              {skill.excluded
                ? t("backup.scope.oversizedExcluded", {
                    name: skill.name,
                    size: formatBytes(skill.bytes),
                  })
                : t("backup.scope.oversizedSkill", {
                    name: skill.name,
                    size: formatBytes(skill.bytes),
                  })}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2 text-[12px] leading-5 text-muted">
          {t("backup.scope.sizeHint")}
        </div>
      )}
    </section>
  );
}
