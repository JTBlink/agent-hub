import type { HTMLAttributes, MouseEventHandler } from "react";
import { cn } from "../utils";

type TagProps = Omit<HTMLAttributes<HTMLElement>, "onClick"> & {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  selected?: boolean;
  disabled?: boolean;
  tone?: "accent" | "success" | "danger";
};

/** Content labels share one palette; clickable labels retain native button behavior. */
export function Tag({
  onClick,
  selected,
  disabled,
  tone = "accent",
  className,
  ...props
}: TagProps) {
  const classes = cn(
    "inline-flex max-w-full items-center gap-1 break-words rounded border px-1.5 py-0.5 text-xs font-medium",
    tone === "accent"
      ? selected
        ? "border-accent bg-accent text-[var(--color-on-accent)]"
        : "border-accent-border bg-accent-bg text-accent"
      : tone === "success"
        ? "border-green-500/30 bg-[var(--color-success-bg)] text-success"
        : "border-red-500/30 bg-danger-bg text-danger",
    onClick &&
      "transition-colors hover:border-current focus-visible:outline focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
  return onClick ? (
    <button
      {...props}
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    />
  ) : (
    <span {...props} className={classes} />
  );
}
