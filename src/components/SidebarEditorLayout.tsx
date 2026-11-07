import type { ReactNode } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./SidebarEditorLayout.css";

interface EditorAction {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

/** One toolbar for plan actions; callers keep confirmation and persistence rules. */
export function SidebarEditorActions({
  create,
  copy,
  remove,
  children,
}: {
  create: EditorAction;
  copy?: EditorAction;
  remove?: EditorAction;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const button = (
    action: EditorAction,
    icon: ReactNode,
    text: string,
    primary = false,
  ) => (
    <button
      type="button"
      disabled={action.disabled}
      aria-label={action.label}
      title={action.label}
      onClick={action.onClick}
      className={
        primary ? "app-button-primary text-xs" : "app-button-secondary text-xs"
      }
    >
      {icon}
      {text}
    </button>
  );
  return (
    <>
      {children}
      {button(
        create,
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />,
        t("common.add"),
        true,
      )}
      {copy &&
        button(
          copy,
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />,
          t("common.copy"),
        )}
      {remove &&
        button(
          remove,
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />,
          t("common.delete"),
        )}
    </>
  );
}

/** Shared editor frame. Domain controls and persistence stay with each caller. */
export function SidebarEditorLayout({
  heading,
  actions,
  above,
  sidebar,
  children,
}: {
  heading: ReactNode;
  actions?: ReactNode;
  above?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 [container-name:sidebar-editor] [container-type:inline-size]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">{heading}</div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>
      {above}
      {sidebar ? (
        <div className="app-sidebar-editor-grid grid min-w-0 overflow-hidden rounded-md border border-border-subtle bg-bg-secondary">
          {sidebar}
          <div className="flex min-w-0 flex-col bg-surface">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
