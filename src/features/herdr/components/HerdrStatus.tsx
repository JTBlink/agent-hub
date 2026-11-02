import { useTranslation } from "react-i18next";
import { cn } from "../../../utils";

import { herdrState } from "../lib/herdrControlApi";
export function HerdrStatus({
  state,
  compact = false,
}: {
  state: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const value = herdrState(state);
  const symbol =
    value === "working"
      ? "◌"
      : value === "blocked"
        ? "?"
        : value === "done"
          ? "✓"
          : value === "idle"
            ? "○"
            : "—";
  return (
    <span
      title={t(`herdr.states.${value}`)}
      aria-label={compact ? t(`herdr.states.${value}`) : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs",
        value === "blocked"
          ? "text-warning"
          : value === "working"
            ? "text-accent-light"
            : value === "done"
              ? "text-success"
              : "text-muted",
      )}
    >
      <span aria-hidden="true">{symbol}</span>
      {!compact && t(`herdr.states.${value}`)}
    </span>
  );
}
