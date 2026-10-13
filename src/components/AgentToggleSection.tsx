import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { AgentIcon } from "./AgentIcon";

export interface AgentToggleItem {
  key: string;
  displayName: string;
  enabled: boolean;
  isAvailable: boolean;
  disabled?: boolean;
  badgeLabel?: string | null;
}

interface Props {
  items: AgentToggleItem[];
  togglingKey?: string | null;
  onToggle: (key: string, enabled: boolean) => void;
  className?: string;
}

export function AgentToggleSection({
  items,
  togglingKey,
  onToggle,
  className,
}: Props) {
  const { t } = useTranslation();

  const availableItems = items.filter((item) => item.isAvailable);
  const enabledAvailableCount = availableItems.filter(
    (item) => item.enabled,
  ).length;

  if (availableItems.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-border-subtle", className)}>
      <div className="border-b border-border-subtle px-6 py-2.5">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-medium text-secondary">
              {t("mySkills.agentTogglesTitle")}
            </span>
            <span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[12px] text-muted">
              {t("mySkills.syncSummary", {
                synced: enabledAvailableCount,
                total: availableItems.length,
              })}
            </span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-3">
          {availableItems.map((item) => (
            <AgentToggle
              key={item.key}
              item={item}
              loading={togglingKey === item.key}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgentToggleInline({
  items,
  togglingKey,
  onToggle,
}: Omit<Props, "className">) {
  const { t } = useTranslation();
  const availableItems = items.filter((item) => item.isAvailable);
  if (availableItems.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {availableItems.map((item) => {
        const loading = togglingKey === item.key;
        const disabled = Boolean(item.disabled || togglingKey);
        const label = `${item.displayName} · ${t(item.enabled ? "mySkills.targetClickUninstall" : "mySkills.targetClickInstall")}`;
        return (
          <button
            key={item.key}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={item.enabled}
            aria-busy={loading}
            disabled={disabled}
            onClick={() => onToggle(item.key, !item.enabled)}
            className={cn(
              "relative rounded-md p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              !disabled && "hover:bg-surface-hover",
              disabled && "opacity-55",
            )}
          >
            <AgentIcon
              agentKey={item.key}
              displayName={item.displayName}
              className={cn(
                "h-5 w-5 rounded-[3px]",
                !item.enabled && "opacity-40 grayscale",
              )}
            />
            {loading && (
              <Loader2 className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 animate-spin text-muted" />
            )}
            {!loading && item.enabled && (
              <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-bg-secondary bg-emerald-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function AgentToggle({
  item,
  loading,
  onToggle,
}: {
  item: AgentToggleItem;
  loading: boolean;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const disabled = Boolean(item.disabled || loading);
  return (
    <button
      type="button"
      onClick={() => onToggle(item.key, !item.enabled)}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors",
        item.enabled
          ? "border-border bg-surface"
          : "border-border-subtle bg-bg-secondary",
        !disabled && "hover:bg-surface-hover",
        disabled && "opacity-55",
      )}
      title={item.badgeLabel ?? undefined}
    >
      <span className="shrink-0">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
        ) : item.enabled ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted" />
        )}
      </span>
      <AgentIcon
        agentKey={item.key}
        displayName={item.displayName}
        className="h-5 w-5 rounded-[4px]"
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-secondary">
        {item.displayName}
      </span>
      {item.badgeLabel && (
        <span className="shrink-0 rounded-full border border-border-subtle bg-bg-secondary px-1.5 py-0.5 text-[11px] text-muted">
          {item.badgeLabel}
        </span>
      )}
    </button>
  );
}
