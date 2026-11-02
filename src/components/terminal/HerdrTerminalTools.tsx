import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import * as api from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import { TerminalActionBar } from "./TerminalActionBar";
import { herdrFocusedPane } from "../../lib/herdrFocusedPane";
import { herdrTarget } from "../../lib/herdrControlApi";
import { ConfirmDialog } from "../ConfirmDialog";
import type { PaneControl } from "./TerminalPane";

interface Props {
  target: api.HerdrTarget;
  current: () => PaneControl | null;
  onOpen: (opened: api.HerdrOpenedWorkspace) => void;
  onError: (message: string) => void;
}

/** Explicit-target controls remain available when the resource sidebar is hidden. */
export function HerdrTerminalTools({
  target,
  current,
  onOpen,
  onError,
}: Props) {
  const { t } = useTranslation();
  const [closing, setClosing] = useState<api.HerdrTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoomed, setZoomed] = useState<boolean>();
  const pending = useRef(false);
  const live = useRef(target);
  live.current = target;
  useEffect(() => {
    let cancelled = false;
    setZoomed(undefined);
    setClosing(null);
    void api
      .getHerdrSnapshot(target.session)
      .then((snapshot) => {
        const pane = snapshot.panes.find(
          (p) =>
            p.pane_id === target.pane_id &&
            p.terminal_id === target.terminal_id,
        );
        if (!cancelled)
          setZoomed(
            snapshot.layouts?.find((l) => l.tab_id === pane?.tab_id)?.zoomed,
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [target.session, target.pane_id, target.terminal_id]);
  const run = async (
    action: api.HerdrAction | "sidebar" | "copy",
    confirmed?: api.HerdrTarget,
  ) => {
    if (pending.current) return false;
    const requested = target;
    const control = current();
    if (!control) {
      onError(t("terminal.herdrWait"));
      return false;
    }
    pending.current = true;
    setBusy(true);
    onError("");
    const unchanged = () =>
      live.current.session === requested.session &&
      live.current.workspace_id === requested.workspace_id &&
      live.current.pane_id === requested.pane_id &&
      live.current.terminal_id === requested.terminal_id &&
      current() === control;
    try {
      if (action === "sidebar") {
        const keys = await api.getHerdrSidebarKeys();
        if (!unchanged()) return false;
        await api.writeTerminal(control.sessionId, keys);
        if (unchanged()) control.focus();
        return true;
      }
      const snapshot = await api.getHerdrSnapshot(requested.session);
      if (!unchanged()) return false;
      const focused = confirmed
        ? snapshot.panes.find(
            (pane) =>
              pane.workspace_id === confirmed.workspace_id &&
              pane.pane_id === confirmed.pane_id &&
              pane.terminal_id === confirmed.terminal_id,
          )
        : herdrFocusedPane(snapshot, requested);
      if (!focused) throw new Error(t("terminal.herdrFocusUnavailable"));
      const resolved = confirmed ?? herdrTarget(requested.session, focused);
      if (action === "close" && !confirmed) {
        setClosing(resolved);
        return true;
      }
      const result = await api.runHerdrAction(
        resolved,
        action === "copy" ? "read" : action,
      );
      if (!unchanged()) return false;
      if (action === "copy") await writeText(result.output ?? "");
      if (action === "zoom") {
        const snapshot = await api.getHerdrSnapshot(requested.session);
        const pane = snapshot.panes.find((p) => p.pane_id === resolved.pane_id);
        if (unchanged())
          setZoomed(
            snapshot.layouts?.find((l) => l.tab_id === pane?.tab_id)?.zoomed,
          );
      }
      if (result.target) {
        const opened = await api.openHerdrWorkspace(
          result.target.session,
          result.target.workspace_id,
          result.target.pane_id,
        );
        if (unchanged()) onOpen(opened);
      }
      return true;
    } catch (error) {
      if (unchanged()) onError(getErrorMessage(error, t("common.error")));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <ConfirmDialog
        open={closing !== null}
        title={t("terminal.closePane")}
        message={t("terminal.closeHerdrPaneConfirm")}
        details={closing ? [closing.pane_id] : []}
        confirmLabel={t("terminal.closePane")}
        onClose={() => setClosing(null)}
        onConfirm={async () => {
          if (!closing || !(await run("close", closing))) return false;
          setClosing(null);
        }}
      />
      <TerminalActionBar
        busy={busy}
        zoomed={zoomed}
        onAction={(action) => void run(action)}
      >
        <span
          className="ml-auto min-w-0 truncate pl-2 text-xs text-muted"
          title={`${target.session} / ${target.workspace_id} / ${target.pane_id}`}
        >
          {target.pane_id}
        </span>
      </TerminalActionBar>
    </>
  );
}
