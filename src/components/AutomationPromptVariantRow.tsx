import { useRef } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationPromptVariant } from "../lib/automationPrompts";
import { SidebarListItem } from "./SidebarListItem";
import { SidebarItemName, type SidebarItemAction } from "./SidebarItemName";
import { cn } from "../utils";

export function AutomationPromptVariantRow({
  variant,
  viewed,
  active,
  disabled,
  group,
  onView,
  onActivate,
  onRename,
  copy,
  remove,
}: {
  variant: AutomationPromptVariant;
  viewed: boolean;
  active: boolean;
  disabled: boolean;
  group: string;
  onView: () => void;
  onActivate: () => void;
  onRename: (name: string) => void;
  copy?: SidebarItemAction;
  remove?: SidebarItemAction;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  return (
    <SidebarListItem
      ref={row}
      label={variant.name || t("automation.unnamedPromptVariant")}
      selected={viewed}
      actions={
        <label
          title={t(
            active
              ? "automation.activePromptVariant"
              : "automation.usePromptVariant",
            { name: variant.name },
          )}
          className="app-sidebar-item-status group relative cursor-pointer"
        >
          <input
            type="radio"
            name={group}
            value={variant.id}
            checked={active}
            disabled={disabled}
            aria-label={t("automation.usePromptVariant", {
              name: variant.name,
            })}
            onChange={onActivate}
            className="peer sr-only"
          />
          <span className="flex h-7 w-6 items-center justify-center rounded text-muted hover:bg-surface-hover peer-checked:text-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
            <Check
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5",
                active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
              )}
            />
          </span>
        </label>
      }
    >
      <SidebarItemName
        name={variant.name || t("automation.unnamedPromptVariant")}
        label={t("automation.editPromptVariant", { name: variant.name })}
        inputLabel={t("automation.promptVariantName")}
        selected={viewed}
        disabled={disabled}
        contextTarget={row}
        onSelect={onView}
        onRename={onRename}
        copy={copy}
        remove={remove}
      >
        {!variant.content.trim() && (
          <span className="mt-1 block text-xs text-warning">
            {t("automation.emptyPromptVariant")}
          </span>
        )}
      </SidebarItemName>
    </SidebarListItem>
  );
}
