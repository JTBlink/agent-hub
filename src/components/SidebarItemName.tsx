import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "./CardActionMenu";

export interface SidebarItemAction {
  disabled?: boolean;
  onSelect: () => void;
}

/** Shared inline rename interaction; a failed save keeps the entered name available. */
export function SidebarItemName({
  name,
  label,
  inputLabel,
  selected,
  disabled,
  contextTarget,
  onSelect,
  onRename,
  copy,
  remove,
  children,
}: {
  name: string;
  label?: string;
  inputLabel: string;
  selected: boolean;
  disabled: boolean;
  contextTarget: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onRename: (name: string) => void | boolean | Promise<void | boolean>;
  copy?: SidebarItemAction;
  remove?: SidebarItemAction;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const restoreFocus = useRef(false);
  const [renaming, setRenaming] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    if (renaming && !pending) {
      input.current?.focus();
      input.current?.select();
    } else if (!renaming && restoreFocus.current) {
      restoreFocus.current = false;
      button.current?.focus();
    }
  }, [renaming, pending]);
  const rename = () => {
    if (disabled) return;
    setDraft(name);
    editing.current = true;
    setRenaming(true);
  };
  const finish = async (save: boolean, focus = false) => {
    if (!editing.current) return;
    editing.current = false;
    const next = draft.trim();
    if (save && !disabled && next && next !== name) {
      setPending(true);
      let saved = false;
      try {
        saved = (await onRename(next)) !== false;
      } catch {
        // The caller reports persistence errors; keep the entered name for retry.
      } finally {
        setPending(false);
        if (!saved) editing.current = true;
      }
      if (!saved) return;
    }
    restoreFocus.current = focus;
    setRenaming(false);
  };
  return (
    <>
      {renaming ? (
        <input
          ref={input}
          aria-label={inputLabel}
          value={draft}
          maxLength={200}
          disabled={disabled || pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void finish(true)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              void finish(event.key === "Enter", true);
            }
          }}
          className="app-input my-1 min-w-0 flex-1 px-1 py-1.5 text-xs"
        />
      ) : (
        <button
          ref={button}
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-pressed={selected}
          onClick={onSelect}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              rename();
            }
          }}
          className="app-sidebar-item-select"
        >
          <span className="app-sidebar-item-label" title={name}>
            {name}
          </span>
          {children}
        </button>
      )}
      <CardActionMenu
        contextOnly
        contextTarget={contextTarget}
        disabled={disabled || renaming}
        label={label ?? t("common.rename")}
        actions={[
          {
            key: "rename",
            label: t("common.rename"),
            icon: <Pencil size={14} aria-hidden="true" />,
            onSelect: rename,
          },
          ...(copy
            ? [
                {
                  key: "copy",
                  label: t("common.copy"),
                  icon: <Copy size={14} aria-hidden="true" />,
                  ...copy,
                },
              ]
            : []),
          ...(remove
            ? [
                {
                  key: "delete",
                  label: t("common.delete"),
                  icon: <Trash2 size={14} aria-hidden="true" />,
                  danger: true,
                  separatorBefore: true,
                  ...remove,
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
