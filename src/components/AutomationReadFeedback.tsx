import { useTranslation } from "react-i18next";
import type { AutomationOverview } from "../lib/tauri";

export function AutomationReadFeedback({
  error,
  issues,
}: {
  error: string | null;
  issues: AutomationOverview["issues"];
}) {
  const { t } = useTranslation();
  return (
    <>
      {error !== null && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger"
        >
          <p>{t("automation.loadFailed")}</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}
      {!!issues.length && (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface p-3 text-[13px] text-secondary"
        >
          <p className="font-medium">{t("automation.partialFailure")}</p>
          <ul className="mt-1 list-inside list-disc space-y-1 break-words text-[12px] text-muted">
            {issues.map((issue, index) => (
              <li key={`${issue.source}-${index}`}>
                {t(`automation.sources.${issue.source}`)}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
