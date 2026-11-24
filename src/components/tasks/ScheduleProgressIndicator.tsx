import { useTranslation } from "react-i18next";
import type { ScheduleProgressResult } from "./useScheduleProgress";

/** Circle uses completed jobs; partial or unavailable totals remain indeterminate. */
export function ScheduleProgressIndicator({
  result,
}: {
  result: ScheduleProgressResult;
}) {
  const { t } = useTranslation();
  const progress = "progress" in result ? result.progress : null;
  const determinate = !!progress && !progress.limited && progress.total > 0;
  const label = !progress
    ? t("schedules.progress.unavailable")
    : progress.total === 0
      ? t("schedules.progress.empty")
      : progress.limited
        ? t("schedules.progress.partial", { total: progress.total })
        : t("schedules.progress.finished", {
            finished: progress.finished,
            total: progress.total,
          });
  const activity = progress
    ? t("schedules.progress.activity", {
        running: progress.running,
        waiting: progress.waiting,
      })
    : "";
  const unknown = progress
    ? progress.total - progress.finished - progress.running - progress.waiting
    : 0;
  const detail = [
    label,
    activity,
    unknown > 0 ? t("schedules.progress.unknown", { count: unknown }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const circumference = 2 * Math.PI * 8;
  const fraction = determinate
    ? Math.max(0, Math.min(1, progress.finished / progress.total))
    : 0.25;
  return (
    <svg
      role="progressbar"
      aria-label={detail}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? progress.total : undefined}
      aria-valuenow={determinate ? progress.finished : undefined}
      width="16"
      height="16"
      viewBox="0 0 20 20"
      className={`shrink-0 ${determinate ? "" : "motion-safe:animate-spin"}`}
    >
      <title>{detail}</title>
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.2"
      />
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}
