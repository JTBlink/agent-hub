import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationPromptVariant } from "../lib/automationPrompts";
import { CardActionMenu } from "./CardActionMenu";
import { cn } from "../utils";

export function AutomationPromptVariantRow({
  variant,
  viewed,
  active,
  disabled,
  canDelete,
  group,
  onView,
  onActivate,
  onRename,
  onRemove,
}: {
  variant: AutomationPromptVariant;
  viewed: boolean;
  active: boolean;
  disabled: boolean;
  canDelete: boolean;
  group: string;
  onView: () => void;
  onActivate: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const restoreFocus = useRef(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(variant.name);
  useEffect(() => {
    if (renaming) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      button.current?.focus();
    }
  }, [renaming]);
  const rename = () => {
    if (disabled) return;
    setName(variant.name);
    editing.current = true;
    setRenaming(true);
  };
  const finish = (save: boolean, focus = false) => {
    if (!editing.current) return;
    editing.current = false;
    restoreFocus.current = focus;
    if (save && !disabled && name.trim() && name.trim() !== variant.name)
      onRename(name.trim());
    setRenaming(false);
  };
  return (
    <div
      ref={row}
      className={cn(
        "flex min-w-0 items-start gap-1 rounded-md border p-1 transition-colors",
        viewed
          ? "border-accent-border bg-surface"
          : "border-transparent hover:bg-surface-hover",
      )}
    >
      {renaming ? (
        <input
          ref={input}
          aria-label={t("automation.promptVariantName")}
          value={name}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finish(event.key === "Enter", true);
            }
          }}
          className="app-input my-1 min-w-0 flex-1 px-1 py-1.5 text-sm"
        />
      ) : (
        <button
          ref={button}
          type="button"
          disabled={disabled}
          aria-label={t("automation.editPromptVariant", { name: variant.name })}
          aria-pressed={viewed}
          onClick={onView}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              rename();
            }
          }}
          className="min-h-10 min-w-0 flex-1 rounded px-1 py-2 text-left text-sm text-secondary focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="block truncate" title={variant.name}>
            {variant.name || t("automation.unnamedPromptVariant")}
          </span>
          {!variant.content.trim() && (
            <span className="mt-1 block text-xs text-warning">
              {t("automation.emptyPromptVariant")}
            </span>
          )}
        </button>
      )}
      <label
        title={t(
          active
            ? "automation.activePromptVariant"
            : "automation.usePromptVariant",
          { name: variant.name },
        )}
        className="group relative flex h-10 w-8 shrink-0 cursor-pointer items-center justify-center rounded"
      >
        <input
          type="radio"
          name={group}
          value={variant.id}
          checked={active}
          disabled={disabled}
          aria-label={t("automation.usePromptVariant", { name: variant.name })}
          onChange={onActivate}
          className="peer sr-only"
        />
        <span className="flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-surface-hover peer-checked:text-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
          <Check
            aria-hidden="true"
            className={cn(
              "h-4 w-4",
              active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
            )}
          />
        </span>
      </label>
      <button
        type="button"
        disabled={disabled || !canDelete}
        aria-label={t("automation.deletePromptVariant", { name: variant.name })}
        title={t("automation.deletePromptVariant", { name: variant.name })}
        className="app-button-ghost mt-1 shrink-0 rounded p-2 text-muted hover:text-danger focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
        onClick={onRemove}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
      <CardActionMenu
        contextOnly
        contextTarget={row}
        disabled={disabled || renaming}
        label={t("automation.editPromptVariant", { name: variant.name })}
        actions={[
          {
            key: "rename",
            label: t("common.rename"),
            icon: <Pencil size={14} aria-hidden="true" />,
            onSelect: rename,
          },
        ]}
      />
    </div>
  );
}
