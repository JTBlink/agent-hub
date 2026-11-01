import { useState, type ReactNode } from "react";
import {
  Plus,
  Columns2,
  Rows2,
  Copy,
  Maximize2,
  Minimize2,
  Eraser,
  PanelLeft,
} from "lucide-react";
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
  | "clear"
  | "sidebar";
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
    { action: "new_tab", label: "herdr.newTab", icon: Plus },
    {
      action: "split_right",
      label: "terminal.splitHorizontal",
      icon: Columns2,
    },
    { action: "split_down", label: "terminal.splitVertical", icon: Rows2 },
    { action: "copy", label: "herdr.copyOutput", icon: Copy },
    {
      action: "zoom",
      label:
        zoomed === undefined
          ? "herdr.toggleZoom"
          : zoomed
            ? "herdr.restorePane"
            : "herdr.zoomPane",
      icon: zoomed ? Minimize2 : Maximize2,
    },
    { action: "clear", label: "herdr.clear", icon: Eraser },
    { action: "sidebar", label: "terminal.herdrSidebar", icon: PanelLeft },
  ] as const;
  return (
    <nav
      aria-label={t("herdr.terminalTools")}
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-border-subtle bg-bg-secondary px-2 py-1"
    >
      {items.map(({ action, label, icon: Icon }) => (
        <button
          type="button"
          key={action}
          className="app-button-ghost flex h-7 items-center gap-1.5 rounded px-2 text-xs"
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={action === "zoom" ? zoomed : undefined}
          disabled={busy || disabled.includes(action)}
          onClick={() => onAction(action)}
        >
          <Icon size={13} />
          <span className="hidden sm:inline">{t(label)}</span>
        </button>
      ))}
      {children}
    </nav>
  );
}

/** Local Shell controls also cover terminals opened through the existing Herdr menu. */
export function LocalTerminalTools({
  current,
  onNew,
  onSplit,
  onSidebar,
  onError,
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
      else if (action === "clear") control.clear?.();
      else if (action === "zoom") onZoom();
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
