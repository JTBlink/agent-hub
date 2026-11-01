import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dirtyWorktreeDocuments } from "../hooks/useWorktreeDocument";
import { SaveWorktreeChangesDialog } from "./worktree/SaveWorktreeChangesDialog";
import { CloseActionDialog } from "./CloseActionDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import * as api from "../lib/tauri";

export function CloseActionGuard() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unsavedExit, setUnsavedExit] = useState<{
    documents: ReturnType<typeof dirtyWorktreeDocuments>;
    remember: boolean;
  } | null>(null);
  const pending = useRef(false);
  const dialogVisible = useRef(false);
  dialogVisible.current = dialogOpen || confirmExit || !!unsavedExit;

  useEffect(() => {
    let disposed = false;
    const unlisten = listen("window-close-requested", async () => {
      if (disposed || pending.current || dialogVisible.current) return;
      pending.current = true;
      try {
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
    });
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn()).catch(console.error);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisten = listen("app-exit-requested", () => {
      if (!disposed && !pending.current && !dialogVisible.current)
        setConfirmExit(true);
    });
    return () => {
      disposed = true;
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
        await api.appExit();
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
      {unsavedExit && (
        <SaveWorktreeChangesDialog
          documents={unsavedExit.documents}
          onCancel={() => setUnsavedExit(null)}
          onProceed={() => {
            const remember = unsavedExit.remember;
            setUnsavedExit(null);
            void perform("close", remember);
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
