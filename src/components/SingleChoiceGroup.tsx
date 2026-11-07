import type { ReactNode } from "react";
import { cn } from "../utils";

/** Single-choice filters with roving keyboard focus. */
export function SingleChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1"
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-label={option.label}
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          title={compact ? option.label : undefined}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? (index + 1) % options.length
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? (index + options.length - 1) % options.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? options.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            onChange(options[next].value);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                "button",
              );
            buttons?.[next]?.focus();
          }}
          className={cn(
            "inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            compact ? "w-7" : "px-2",
            value === option.value
              ? "bg-surface-active text-primary"
              : "text-muted hover:bg-surface-hover hover:text-primary",
          )}
        >
          {option.icon}
          {!compact && option.label}
        </button>
      ))}
    </div>
  );
}
