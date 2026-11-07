import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AutomationPromptVariant } from "../lib/automationPrompts";
import { SidebarListItem } from "./SidebarListItem";
import { SidebarItemName, type SidebarItemAction } from "./SidebarItemName";
import { SidebarActivationControl } from "./SidebarActivationControl";

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
        <SidebarActivationControl
          active={active}
          disabled={disabled}
          label={t("automation.usePromptVariant", { name: variant.name })}
          activeLabel={t("automation.activePromptVariant")}
          radio={{ name: group, value: variant.id }}
          onActivate={onActivate}
        />
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
