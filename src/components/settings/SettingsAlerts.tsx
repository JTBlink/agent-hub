import { AlertTriangle, Bug, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { actionButtonClass } from "./settingsStyles";
import { useSettingsDiagnostics } from "./useSettingsDiagnostics";

export function SettingsAlerts({
  diagnostics,
}: {
  diagnostics: ReturnType<typeof useSettingsDiagnostics>;
}) {
  const { t } = useTranslation();
  const {
    reportingIssue,
    lastPanic,
    repoWarnings,
    handleDismissPanic,
    handleReportIssue,
  } = diagnostics;
  return (
    <div className="shrink-0 space-y-2 empty:hidden">
      {repoWarnings.length > 0 && (
        <div className="app-panel flex flex-wrap items-start gap-2 p-3 border border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1 space-y-1 text-[13px] text-amber-800 dark:text-amber-300">
            {repoWarnings.map((code) => (
              <p key={code}>{t(`settings.repoWarning_${code}`)}</p>
            ))}
          </div>
        </div>
      )}
      {lastPanic && (
        <div className="app-panel flex flex-wrap items-center justify-between gap-2 p-3 border border-red-500/40 bg-red-500/10">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {t("settings.panicBanner", { time: lastPanic.timestamp })}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReportIssue}
              disabled={reportingIssue}
              className={`${actionButtonClass} bg-red-600 hover:bg-red-700 text-white border-red-600`}
            >
              {reportingIssue ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Bug className="w-3 h-3" />
              )}
              {t("settings.reportIssue")}
            </button>
            <button
              type="button"
              onClick={handleDismissPanic}
              className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
            >
              {t("settings.panicDismiss")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
