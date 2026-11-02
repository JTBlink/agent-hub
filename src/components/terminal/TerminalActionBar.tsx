import { useState, type ReactNode } from "react";
import "@vscode/codicons/dist/codicon.css";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getErrorMessage } from "../../lib/error";
import type { PaneControl } from "./TerminalPane";
export type TerminalAction =
  | "new_tab"
  | "split_right"
  | "split_down"
  | "copy"
  | "zoom"
  | "sidebar"
  | "close";
export function TerminalActionBar({
  busy,
  zoomed,
  onAction,
  disabled = [],
  children,
}: {
  busy: boolean;
  zoomed?: boolean;
  onAction: (action: TerminalAction) => void;
  disabled?: TerminalAction[];
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const items = [
    { action: "new_tab", label: "herdr.newTab", icon: "add" },
    {
      action: "split_right",
      label: "terminal.splitHorizontal",
      icon: "split-horizontal",
    },
    {
      action: "split_down",
      label: "terminal.splitVertical",
      icon: "split-vertical",
    },
    { action: "copy", label: "herdr.copyOutput", icon: "copy" },
    {
      action: "zoom",
      label:
        zoomed === undefined
          ? "herdr.toggleZoom"
          : zoomed
            ? "herdr.restorePane"
            : "herdr.zoomPane",
      icon: zoomed ? "screen-normal" : "screen-full",
    },
    { action: "close", label: "terminal.closePane", icon: "chrome-close" },
    {
      action: "sidebar",
      label: "terminal.herdrSidebar",
      icon: "layout-sidebar-left",
    },
  ] as const;
  return (
    <nav
      aria-label={t("herdr.terminalTools")}
      className="flex shrink-0 items-center gap-1 overflow-x-auto bg-bg-secondary px-1"
    >
      {items.map(({ action, label, icon }) => (
        <button
          type="button"
          key={action}
          className="app-button-ghost flex h-7 w-7 shrink-0 items-center justify-center rounded"
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={action === "zoom" ? zoomed : undefined}
          disabled={busy || disabled.includes(action)}
          onClick={() => onAction(action)}
        >
          <span className={`codicon codicon-${icon}`} aria-hidden="true" />
        </button>
      ))}
      {children}
    </nav>
  );
}

/** Local Shell controls also cover terminals opened through the Herdr shortcut. */
export function LocalTerminalTools({
  current,
  onNew,
  onSplit,
  onSidebar,
  onError,
  onClose,
  zoomed,
  onZoom,
  canSplit,
  canAdd,
  canZoom,
}: {
  current: () => PaneControl | null;
  onNew: () => void;
  onSplit: (direction: "horizontal" | "vertical") => void;
  onSidebar: () => Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
  zoomed: boolean;
  onZoom: () => void;
  canSplit: boolean;
  canAdd: boolean;
  canZoom: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async (action: TerminalAction) => {
    const control = current();
    if (!control) return;
    try {
      if (action === "new_tab") onNew();
      else if (action === "split_right" || action === "split_down")
        onSplit(action === "split_right" ? "horizontal" : "vertical");
      else if (action === "copy") await writeText(control.read?.() ?? "");
      else if (action === "zoom") onZoom();
      else if (action === "close") onClose();
      else {
        setBusy(true);
        await onSidebar();
      }
    } catch (error) {
      if (current() === control)
        onError(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };
  const disabled: TerminalAction[] = [];
  if (!canSplit) disabled.push("split_right", "split_down");
  if (!canAdd) disabled.push("new_tab");
  if (!canZoom) disabled.push("zoom");
  return (
    <TerminalActionBar
      busy={busy}
      zoomed={zoomed}
      disabled={disabled}
      onAction={(action) => void run(action)}
    />
  );
}
