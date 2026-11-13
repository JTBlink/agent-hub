import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRecentLogExcerpt, type LogExcerpt } from "../../lib/tauri";
import { actionButtonClass } from "./settingsStyles";

export function LogsSettings() {
  const { t } = useTranslation();
  const [result, setResult] = useState<LogExcerpt>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setResult(await getRecentLogExcerpt());
    } catch (cause) {
      setResult(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section id="settings-logs" className="space-y-4">
      <div className="app-panel p-4">
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="app-section-title">{t("settings.logsTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              {t("settings.logsDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className={actionButtonClass}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("settings.refreshLogs")}
          </button>
        </div>
        {result && (
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              {t("settings.logLineCount", { count: result.line_count })}
            </span>
            <span className="max-w-full truncate" title={result.log_path}>
              {result.log_path}
            </span>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : loading && !result ? (
          <p role="status" className="text-sm text-muted">
            {t("common.loading")}
          </p>
        ) : (
          <pre className="max-h-[65vh] min-h-48 overflow-auto rounded-lg border border-border-subtle bg-background p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-secondary">
            {result?.excerpt || t("settings.noLogs")}
          </pre>
        )}
      </div>
    </section>
  );
}
