import { useTranslation } from "react-i18next";
import type { ScheduleProgressResult } from "./useScheduleProgress";

export function ScheduleProgressIndicator({
  result,
}: {
  result: ScheduleProgressResult;
}) {
  const { t } = useTranslation();
  if ("unavailable" in result)
    return (
      <p className="mt-1 text-muted">{t("schedules.progress.unavailable")}</p>
    );
  const { total, finished, running, waiting, limited } = result.progress;
  if (total === 0)
    return <p className="mt-1 text-muted">{t("schedules.progress.empty")}</p>;
  const label = limited
    ? t("schedules.progress.partial", { total })
    : t("schedules.progress.finished", { finished, total });
  const unknown = total - finished - running - waiting;
  return (
    <div className="mt-1.5 min-w-28 space-y-1 whitespace-nowrap text-muted">
      {!limited && (
        <div
          role="progressbar"
          aria-valuenow={finished}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={label}
          className="h-1 max-w-32 overflow-hidden rounded bg-surface-active"
        >
          <div
            className="h-full rounded bg-accent"
            style={{ width: `${(finished / total) * 100}%` }}
          />
        </div>
      )}
      <p className="tabular-nums">{label}</p>
      <p className="tabular-nums">
        {t("schedules.progress.activity", { running, waiting })}
        {unknown > 0 &&
          ` · ${t("schedules.progress.unknown", { count: unknown })}`}
      </p>
    </div>
  );
}
