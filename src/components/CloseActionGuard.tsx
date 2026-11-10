import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dirtyWorktreeDocuments } from "../hooks/useWorktreeDocument";
import { SaveWorktreeChangesDialog } from "./worktree/SaveWorktreeChangesDialog";
import { CloseActionDialog } from "./CloseActionDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import * as api from "../lib/tauri";
import {
  listenWorkspaceEvent,
  workspaceWindowLabel,
} from "../lib/workspaceWindow";

export function CloseActionGuard() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quitWaiting, setQuitWaiting] = useState<string | null>(null);
  const [unsavedExit, setUnsavedExit] = useState<{
    documents: ReturnType<typeof dirtyWorktreeDocuments>;
    remember: boolean;
    quitToken?: string;
  } | null>(null);
  const pending = useRef(false);
  const quitApplication = useRef(false);
  const quitCheck = useRef<string | null>(null);
  const dialogVisible = useRef(false);
  dialogVisible.current =
    dialogOpen || confirmExit || !!unsavedExit || !!quitWaiting;

  useEffect(() => {
    let disposed = false;
    const unlisten = listenWorkspaceEvent(
      "window-close-requested",
      async () => {
        if (
          disposed ||
          pending.current ||
          dialogVisible.current ||
          quitCheck.current
        )
          return;
        pending.current = true;
        quitApplication.current = false;
        try {
          if (
            workspaceWindowLabel() !== "main" ||
            (await api.workspaceWindowCount()) > 1
          ) {
            const documents = dirtyWorktreeDocuments();
            if (documents.length)
              setUnsavedExit({ documents, remember: false });
            else
              await api
                .closeWorkspaceWindow()
                .catch(() => toast.error(t("common.requestFailed")));
            return;
          }
          if (disposed) return;
          const [tray, pref] = await Promise.all([
            api.getSettings("show_tray_icon"),
            api.getSettings("close_action"),
          ]);
          if (disposed) return;
          const enabled = (() => {
            const normalized = (tray ?? "true").trim().toLowerCase();
            return !(
              normalized === "false" ||
              normalized === "0" ||
              normalized === "no" ||
              normalized === "off"
            );
          })();
          setTrayEnabled(enabled);
          if (pref === "close") {
            setConfirmExit(true);
          } else if (pref === "hide" && enabled) {
            await api.hideToTray();
          } else {
            setDialogOpen(true);
          }
        } catch {
          if (!disposed) {
            setTrayEnabled(false);
            setDialogOpen(true);
          }
        } finally {
          pending.current = false;
        }
      },
    );
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn()).catch(console.error);
    };
  }, [t]);

  useEffect(() => {
    let disposed = false;
    const unlisten = listenWorkspaceEvent<string>(
      "workspace-quit-check",
      async (event) => {
        if (disposed) return;
        const token = event.payload;
        if (dialogVisible.current && !pending.current) {
          await api.workspaceQuitReply(token, false);
          return;
        }
        quitCheck.current = token;
        setDialogOpen(false);
        setConfirmExit(false);
        try {
          const documents = dirtyWorktreeDocuments();
          if (documents.length) {
            if (isTauri()) {
              await getCurrentWindow().show();
              await getCurrentWindow().setFocus();
            }
            setUnsavedExit({ documents, remember: false, quitToken: token });
            return;
          }
          setQuitWaiting(token);
          await api.workspaceQuitReply(token, true);
        } catch {
          await api.workspaceQuitReply(token, false).catch(() => {});
        } finally {
          pending.current = false;
        }
      },
    );
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn()).catch(console.error);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisten = listenWorkspaceEvent("app-exit-requested", () => {
      if (
        !disposed &&
        !pending.current &&
        !dialogVisible.current &&
        !quitCheck.current
      ) {
        quitApplication.current = true;
        setConfirmExit(true);
      }
    });
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn()).catch(console.error);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen("workspace-quit-cancelled", () => {
      quitCheck.current = null;
      setQuitWaiting(null);
      setUnsavedExit((current) => (current?.quitToken ? null : current));
    });
    return () => {
      void unlisten.then((fn) => fn()).catch(console.error);
    };
  }, []);

  const perform = async (action: "close" | "hide", remember: boolean) => {
    if (pending.current) return false;
    if (action === "close") {
      const documents = dirtyWorktreeDocuments();
      if (documents.length) {
        setDialogOpen(false);
        setConfirmExit(false);
        setUnsavedExit({ documents, remember });
        return false;
      }
    }
    pending.current = true;
    setBusy(true);
    try {
      if (action === "hide") {
        // Restore a reachable background entry before hiding the window.
        if (!trayEnabled) {
          await api.setSettings("show_tray_icon", "true");
          setTrayEnabled(true);
        }
        if (remember) await api.setSettings("close_action", "hide");
        await api.hideToTray();
      } else {
        if (remember) await api.setSettings("close_action", "close");
        dialogVisible.current = false;
        setDialogOpen(false);
        setConfirmExit(false);
        if (
          quitApplication.current ||
          (workspaceWindowLabel() === "main" &&
            (await api.workspaceWindowCount()) === 1)
        )
          await api.appExit();
        else await api.closeWorkspaceWindow();
      }
      setDialogOpen(false);
      setConfirmExit(false);
    } catch {
      toast.error(t("common.requestFailed"));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={!!quitWaiting}
        title={t("closeAction.exitTitle")}
        message={t("closeAction.waitingForWorkspaces")}
        confirmDisabled
        onClose={() => {
          if (quitWaiting) void api.workspaceQuitReply(quitWaiting, false);
        }}
        onConfirm={async () => false}
      />
      {unsavedExit && (
        <SaveWorktreeChangesDialog
          documents={unsavedExit.documents}
          onCancel={() => {
            if (unsavedExit.quitToken)
              void api.workspaceQuitReply(unsavedExit.quitToken, false);
            setUnsavedExit(null);
          }}
          onProceed={() => {
            const { remember, quitToken } = unsavedExit;
            setUnsavedExit(null);
            if (quitToken) {
              setQuitWaiting(quitToken);
              void api.workspaceQuitReply(quitToken, true);
            } else void perform("close", remember);
          }}
        />
      )}
      {dialogOpen && (
        <CloseActionDialog
          open={dialogOpen}
          busy={busy}
          trayEnabled={trayEnabled}
          onCancel={() => setDialogOpen(false)}
          onClose={(remember) => {
            void perform("close", remember);
          }}
          onHide={(remember) => {
            void perform("hide", remember);
          }}
        />
      )}
      <ConfirmDialog
        open={confirmExit}
        title={t("closeAction.exitTitle")}
        message={t("closeAction.exitMessage")}
        confirmLabel={t("closeAction.close")}
        tone="warning"
        onClose={() => setConfirmExit(false)}
        onConfirm={() => perform("close", false)}
      />
    </>
  );
}
