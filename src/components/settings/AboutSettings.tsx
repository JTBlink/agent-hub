import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  Bug,
  FileArchive,
  Github,
  Globe,
  Loader2,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ModuleReleaseLink } from "../../components/ModuleReleaseLink";
import { WEBSITE_URL } from "../../lib/distribution";
import { actionButtonClass } from "./settingsStyles";
import { useSettingsDiagnostics } from "./useSettingsDiagnostics";
import { AppVersionCheck } from "./AppVersionCheck";

export function AboutSettings({
  diagnostics,
}: {
  diagnostics: ReturnType<typeof useSettingsDiagnostics>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    openingGithub,
    reportingIssue,
    exportingLogs,
    appVersion,
    handleOpenGithub,
    handleExportLogs,
    handleReportIssue,
  } = diagnostics;
  return (
    <section className="space-y-4">
      <div className="app-panel flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-hover border border-border flex items-center justify-center">
            <Settings2 className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-primary">
              {t("settings.version", { version: appVersion })}
            </h3>
            <p className="text-muted text-[13px]">{t("settings.tagline")}</p>
          </div>
        </div>
        <AppVersionCheck />
      </div>
      <div className="app-panel p-4">
        <h2 className="app-section-title mb-3">
          {t("settings.helpAndDiagnostics")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <ModuleReleaseLink
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
          />
          <button
            type="button"
            onClick={() => navigate("/help")}
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
          >
            <BookOpen className="w-3 h-3" /> {t("settings.help")}
          </button>
          <button
            type="button"
            onClick={handleReportIssue}
            disabled={reportingIssue}
            title={t("settings.reportIssueHint")}
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
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
            onClick={handleExportLogs}
            disabled={exportingLogs}
            title={t("settings.exportLogsHint")}
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
          >
            {exportingLogs ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FileArchive className="w-3 h-3" />
            )}
            {t("settings.exportLogs")}
          </button>
          <button
            type="button"
            onClick={() => {
              openUrl(WEBSITE_URL).catch(() => {});
            }}
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
          >
            <Globe className="w-3 h-3" /> {t("settings.website")}
          </button>
          <button
            type="button"
            onClick={handleOpenGithub}
            disabled={openingGithub}
            className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
          >
            <Github className="w-3 h-3" /> GitHub
          </button>
        </div>
      </div>
    </section>
  );
}
