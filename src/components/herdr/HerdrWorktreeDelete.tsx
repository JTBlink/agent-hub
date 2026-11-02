import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { deleteHerdrWorktree } from "../../lib/herdrControlApi";
import { getErrorMessage } from "../../lib/error";
import { getAppScale } from "../../lib/textScale";
import { ConfirmDialog } from "../ConfirmDialog";

/** The checkout row remains the click target; deletion is an explicit context action. */
export function HerdrWorktreeDelete({
  children,
  session,
  projectId,
  path,
  workspaceId,
  disabled,
  onDeleted,
}: {
  children: ReactNode;
  session: string;
  projectId: string;
  path: string;
  workspaceId?: string;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const row = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMenu(null);
    row.current?.querySelector("button")?.focus();
  };
  useLayoutEffect(() => {
    if (!menu) return;
    item.current?.focus();
    const dismiss = () => setMenu(null);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);
  const open = (x: number, y: number) => {
    if (disabled) return;
    const scale = getAppScale();
    setMenu({
      left: Math.max(8, Math.min(x / scale, window.innerWidth / scale - 224)),
      top: Math.max(8, Math.min(y / scale, window.innerHeight / scale - 56)),
    });
  };
  return (
    <>
      <div
        ref={row}
        onContextMenu={(event) => {
          event.preventDefault();
          open(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            open(rect.left, rect.bottom);
          }
        }}
      >
        {children}
      </div>
      {menu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onPointerDown={close}
              onContextMenu={(event) => {
                event.preventDefault();
                close();
              }}
            />
            <div
              role="menu"
              aria-label={t("herdr.deleteWorktree")}
              className="fixed z-50 w-52 max-w-[calc(100vw/var(--app-scale)-16px)] rounded border border-border bg-surface p-1 shadow-lg"
              style={menu}
              onKeyDown={(event) => {
                if (["Escape", "Tab"].includes(event.key)) {
                  event.preventDefault();
                  close();
                }
                if (
                  ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  item.current?.focus();
                }
              }}
            >
              <button
                ref={item}
                role="menuitem"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-danger hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                onClick={() => {
                  close();
                  setError("");
                  setConfirming(true);
                }}
              >
                {t("herdr.deleteWorktree")}
              </button>
            </div>
          </>,
          document.body,
        )}
      <ConfirmDialog
        open={confirming}
        title={t("herdr.deleteWorktree")}
        message={t("herdr.deleteWorktreeHelp", { path })}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          try {
            await deleteHerdrWorktree(session, projectId, path, workspaceId);
            onDeleted();
          } catch (cause) {
            setError(getErrorMessage(cause, t("common.error")));
            return false;
          }
        }}
      >
        {error && (
          <p role="alert" className="text-xs text-danger whitespace-pre-wrap">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
