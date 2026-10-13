import { getVersion } from "@tauri-apps/api/app";
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../../context/AppContext";
import { FEEDBACK_URL, PROJECT_URL } from "../../lib/distribution";
import * as api from "../../lib/tauri";

export function useSettingsDiagnostics() {
  const { t, i18n } = useTranslation();
  const { tools } = useApp();
  const enabledTools = tools.filter((tool) => tool.installed && tool.enabled);
  const [openingGithub, setOpeningGithub] = useState(false);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [lastPanic, setLastPanic] = useState<api.PanicInfo | null>(null);
  const [repoWarnings, setRepoWarnings] = useState<string[]>([]);
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    api
      .checkLastPanic()
      .then(setLastPanic)
      .catch(() => {});
    api
      .getCentralRepoWarnings()
      .then(setRepoWarnings)
      .catch(() => {});
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const handleOpenGithub = async () => {
    try {
      setOpeningGithub(true);
      await openUrl(PROJECT_URL);
    } catch (error) {
      console.error("Failed to open GitHub repository", error);
      toast.error(t("common.error"));
    } finally {
      setOpeningGithub(false);
    }
  };

  const handleExportLogs = async () => {
    setExportingLogs(true);
    try {
      const result = await api.exportLogsZip();
      toast.success(
        t("settings.exportLogsDone", { count: result.file_count }),
        {
          description: result.zip_path,
        },
      );
    } catch (error) {
      console.error("Failed to export logs", error);
      toast.error(t("settings.exportLogsFailed"));
    } finally {
      setExportingLogs(false);
    }
  };

  const handleDismissPanic = async () => {
    try {
      await api.clearLastPanic();
    } catch (err) {
      console.warn("Failed to clear last_panic.log", err);
    }
    setLastPanic(null);
  };

  const handleReportIssue = async () => {
    setReportingIssue(true);
    try {
      const [info, logExcerpt, panicInfo] = await Promise.all([
        api.getDiagnosticInfo(),
        api.getRecentLogExcerpt().catch((err) => {
          console.warn("Failed to read log excerpt", err);
          return null;
        }),
        api.checkLastPanic().catch(() => null),
      ]);
      const enabledBuiltin = enabledTools
        .filter((tool) => !tool.is_custom)
        .map((tool) => tool.key);
      const enabledCustomCount = enabledTools.filter(
        (tool) => tool.is_custom,
      ).length;
      const agentsLine =
        enabledBuiltin.length === 0 && enabledCustomCount === 0
          ? "(none)"
          : [
              enabledBuiltin.join(", "),
              enabledCustomCount > 0 ? `${enabledCustomCount} custom` : "",
            ]
              .filter(Boolean)
              .join(", ");
      const parts = [
        "**Diagnostics** (auto-collected by agent-hub)",
        "",
        `- App version: \`${info.app_version}\``,
        `- OS: \`${info.os} ${info.os_version} (${info.arch})\``,
        `- UI locale: \`${i18n.language}\``,
        `- Enabled agents: ${agentsLine}`,
        `- Central repo: \`${info.central_repo_path}\`${info.central_repo_path_overridden ? " (custom path)" : ""}`,
      ];
      if (panicInfo) {
        parts.push(
          "",
          `**Last panic** (${panicInfo.timestamp})`,
          "",
          "```",
          panicInfo.message,
          "```",
        );
      }
      if (logExcerpt) {
        parts.push(
          "",
          `**Recent log** (\`${logExcerpt.log_path}\`, ${logExcerpt.line_count} lines${logExcerpt.has_warnings ? ", includes warnings/errors" : ""})`,
          "",
          "```log",
          logExcerpt.excerpt,
          "```",
          "",
          `> ${t("settings.reportIssueExportHint")}`,
        );
      }
      const md = parts.join("\n");
      let copied = false;
      try {
        await clipboardWriteText(md);
        copied = true;
      } catch (err) {
        console.error("Clipboard write failed", err);
        try {
          await navigator.clipboard.writeText(md);
          copied = true;
        } catch (err2) {
          console.error("Browser clipboard fallback also failed", err2);
        }
      }
      try {
        await openUrl(FEEDBACK_URL);
      } catch (err) {
        console.error("Failed to open issue page", err);
      }
      if (copied) {
        toast.success(t("settings.diagnosticsCopied"));
        if (panicInfo) {
          try {
            await api.clearLastPanic();
          } catch (err) {
            console.warn("Failed to clear last_panic.log", err);
          }
          setLastPanic(null);
        }
      } else {
        toast.message(t("settings.diagnosticsCopyManual"), { description: md });
      }
    } catch (error) {
      console.error("Failed to prepare diagnostics", error);
      toast.error(t("common.error"));
    } finally {
      setReportingIssue(false);
    }
  };

  return {
    openingGithub,
    reportingIssue,
    exportingLogs,
    lastPanic,
    repoWarnings,
    appVersion,
    handleOpenGithub,
    handleExportLogs,
    handleDismissPanic,
    handleReportIssue,
  };
}
