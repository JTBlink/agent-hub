import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

/** Shared activation affordance; radio groups and persisted actions keep their own semantics. */
export function SidebarActivationControl({
  active,
  disabled,
  label,
  activeLabel,
  onActivate,
  radio,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  activeLabel: string;
  onActivate: () => void;
  radio?: { name: string; value: string };
}) {
  const { t } = useTranslation();
  const face = (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-7 w-10 items-center justify-center rounded-sm border text-xs font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
        active
          ? "border-transparent"
          : "app-button-secondary !p-0 group-hover:border-accent-border group-hover:bg-accent-bg group-hover:text-accent-light",
      )}
    >
      {active ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-[var(--color-on-accent)]">
          <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      ) : (
        t("common.use")
      )}
    </span>
  );
  const controlClass = cn(
    "group relative flex h-8 w-10 shrink-0 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
    disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
  );
  if (radio)
    return (
      <label title={active ? activeLabel : label} className={controlClass}>
        <input
          type="radio"
          name={radio.name}
          value={radio.value}
          checked={active}
          disabled={disabled}
          aria-label={label}
          onChange={onActivate}
          className="peer sr-only"
        />
        {face}
      </label>
    );
  if (active)
    return (
      <span
        role="img"
        aria-label={activeLabel}
        title={activeLabel}
        className="flex h-8 w-10 shrink-0 items-center justify-center"
      >
        {face}
      </span>
    );
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onActivate}
      className={controlClass}
    >
      {face}
    </button>
  );
}
