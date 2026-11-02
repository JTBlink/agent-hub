import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getAppScale } from "../../lib/textScale";

export function TerminalTabButton({
  name,
  selected,
  onSelect,
  onRename,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  onRename?: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const wasEditing = useRef(false);
  const rename = () => {
    setMenu(null);
    setDraft(name);
    cancelled.current = false;
    setEditing(true);
  };
  const closeMenu = () => {
    setMenu(null);
    button.current?.focus();
  };
  useLayoutEffect(() => {
    if (editing) {
      wasEditing.current = true;
      input.current?.focus();
      input.current?.select();
    } else if (wasEditing.current) {
      wasEditing.current = false;
      button.current?.focus();
    }
  }, [editing]);
  useLayoutEffect(() => {
    if (!menu) return;
    item.current?.focus();
    const close = () => setMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  const showMenu = (x: number, y: number) => {
    if (!onRename) return;
    const scale = getAppScale();
    setMenu({
      left: Math.max(8, Math.min(x / scale, window.innerWidth / scale - 168)),
      top: Math.max(8, Math.min(y / scale, window.innerHeight / scale - 48)),
    });
  };
  const finish = () => {
    if (!cancelled.current) onRename?.(draft.trim());
    setEditing(false);
  };
  return (
    <>
      {editing ? (
        <input
          ref={input}
          value={draft}
          aria-label={t("terminal.renameTab")}
          className="app-input my-1 w-40 min-w-0 text-xs"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              cancelled.current = event.key === "Escape";
              finish();
            }
          }}
        />
      ) : (
        <button
          ref={button}
          type="button"
          role="tab"
          aria-selected={selected}
          className="flex h-full max-w-48 items-center gap-1.5 px-3 text-xs"
          title={name}
          onClick={onSelect}
          onDoubleClick={onRename ? rename : undefined}
          onContextMenu={(event) => {
            if (!onRename) return;
            event.preventDefault();
            showMenu(event.clientX, event.clientY);
          }}
          onKeyDown={(event) => {
            if (
              onRename &&
              (event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10"))
            ) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              showMenu(rect.left, rect.bottom);
            } else if (onRename && event.key === "F2") {
              event.preventDefault();
              rename();
            }
          }}
        >
          <TerminalSquare size={13} className="shrink-0" />
          <span className="truncate">{name}</span>
        </button>
      )}
      {menu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onPointerDown={closeMenu}
              onContextMenu={(event) => {
                event.preventDefault();
                closeMenu();
              }}
            />
            <div
              role="menu"
              aria-label={t("terminal.tabActions")}
              className="fixed z-50 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg"
              style={menu}
              onKeyDown={(event) => {
                if (["Escape", "Tab"].includes(event.key)) {
                  event.preventDefault();
                  closeMenu();
                }
                if (
                  ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  item.current?.focus();
                }
              }}
            >
              <button
                ref={item}
                role="menuitem"
                type="button"
                className="flex w-full rounded px-2 py-1.5 text-left text-xs text-secondary hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                onClick={rename}
              >
                {t("terminal.renameTab")}
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
