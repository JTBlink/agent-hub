import { useTranslation } from "react-i18next";
import { cn } from "../../utils";

/** Shared task/review/check presentation; colors never imply a merge decision. */
export function TaskStatusBadge({
  state,
  label,
}: {
  state: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const value = state.toLowerCase();
  const negative = [
    "failure",
    "failed",
    "error",
    "blocked",
    "changes_requested",
    "conflict",
    "dirty",
    "not_approved",
    "ci_must_pass",
    "discussions_not_resolved",
  ].includes(value);
  const positive = [
    "success",
    "approved",
    "mergeable",
    "clean",
    "merged",
  ].includes(value);
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-bg-secondary px-1.5 py-0.5 text-[11px]",
        negative
          ? "text-danger"
          : positive
            ? "text-[var(--color-brand-teal)]"
            : "text-muted",
      )}
    >
      {label ?? t(`tasks.values.${value}`, { defaultValue: state })}
    </span>
  );
}
