import { CheckCircle2, Circle, Clock3, Loader2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlatformOpenButton } from "../PlatformOpenButton";
import type { ScheduleProgressResult } from "./useScheduleProgress";
import { ScheduleProgressIndicator } from "./ScheduleProgressIndicator";
import { cn } from "../../utils";

const statuses = {
  success: "passed",
  running: "running",
  in_progress: "running",
  pending: "pending",
  queued: "pending",
  failed: "failed",
  failure: "failed",
  canceled: "canceled",
  cancelled: "canceled",
} as const;

export function ScheduleRunStatus({
  status,
  url,
  host,
  progress,
}: {
  status: string | null;
  url: string | null;
  host: string;
  progress?: ScheduleProgressResult;
}) {
  const { t } = useTranslation();
  if (!status) return <>—</>;
  const normalized = Object.prototype.hasOwnProperty.call(statuses, status)
    ? statuses[status as keyof typeof statuses]
    : null;
  const label = normalized ? t(`schedules.run.${normalized}`) : status;
  const Icon =
    normalized === "passed"
      ? CheckCircle2
      : normalized === "failed" || normalized === "canceled"
        ? XCircle
        : normalized === "running"
          ? Loader2
          : normalized === "pending"
            ? Clock3
            : Circle;
  const content = (
    <>
      {normalized === "running" && progress ? (
        <ScheduleProgressIndicator result={progress} />
      ) : (
        <Icon
          size={13}
          aria-hidden="true"
          className={
            normalized === "running" ? "motion-safe:animate-spin" : "shrink-0"
          }
        />
      )}
      <span>{label}</span>
    </>
  );
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
        normalized === "passed"
          ? "bg-[var(--color-success-bg)] text-success"
          : normalized === "failed"
            ? "bg-danger-bg text-danger"
            : normalized === "running" || normalized === "pending"
              ? "bg-accent-bg text-accent-light"
              : "bg-surface-active text-secondary",
      )}
    >
      {url ? (
        <PlatformOpenButton
          url={url}
          host={host}
          label={t("schedules.openRun", { status: label })}
          className="inline-flex items-center gap-1.5 rounded-full hover:underline focus-visible:outline focus-visible:outline-accent"
        >
          {content}
        </PlatformOpenButton>
      ) : (
        <span className="inline-flex items-center gap-1.5">{content}</span>
      )}
    </span>
  );
}
