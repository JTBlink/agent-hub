import { useTranslation } from "react-i18next";
import type { AutomationTaskStatus } from "../lib/tauri";
import { cn } from "../utils";

export function AutomationStatusBadge({
  status,
  className,
}: {
  status: AutomationTaskStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]",
        status === "error"
          ? "text-danger"
          : status === "active" || status === "running"
            ? "text-accent-light"
            : "text-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {t(`automation.states.${status}`)}
    </span>
  );
}
