import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import type { PaneControl } from "./TerminalPane";

export function useHerdrShortcut(
  current: () => PaneControl | null,
  selectionKey: string,
) {
  const { t } = useTranslation();
  const target = useRef(current);
  useLayoutEffect(() => {
    target.current = current;
  }, [current]);
  const selection = useRef({ key: selectionKey, revision: 0 });
  useLayoutEffect(() => {
    if (selection.current.key !== selectionKey)
      selection.current = {
        key: selectionKey,
        revision: selection.current.revision + 1,
      };
  }, [selectionKey]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState("");
  const [update, setUpdate] = useState<api.HerdrUpdate | null>(null);
  const checkRevision = useRef(0);
  const check = () => {
    const revision = ++checkRevision.current;
    void api
      .checkHerdrUpdate()
      .then((value) => {
        if (revision === checkRevision.current) setUpdate(value);
      })
      .catch(() => {
        // Optional background checks do not interrupt terminal use.
      });
  };
  const launch = async () => {
    if (inFlight.current) return;
    const pane = target.current();
    if (!pane) {
      setNotice(t("terminal.herdrWait"));
      return;
    }
    const inputRevision = pane.inputRevision();
    const selectionRevision = selection.current.revision;
    const originalFocus = document.activeElement;
    let focusChanged = false;
    const focus = (event: FocusEvent) => {
      if (event.target !== originalFocus && !pane.ownsFocus(event.target))
        focusChanged = true;
    };
    const blur = () => {
      focusChanged = true;
    };
    const stillCurrent = () =>
      !focusChanged &&
      target.current() === pane &&
      selection.current.revision === selectionRevision &&
      pane.inputRevision() === inputRevision;
    document.addEventListener("focusin", focus);
    window.addEventListener("blur", blur);
    inFlight.current = true;
    setBusy(true);
    try {
      const initial = await api.terminalLaunchState(pane.sessionId);
      if (initial.herdr_active) {
        if (stillCurrent()) pane.focus();
        return;
      }
      let installed = await api.detectHerdr();
      if (!installed) {
        setNotice(t("terminal.herdrInstalling"));
        installed = await api.installHerdr();
      }
      if (!stillCurrent()) {
        setNotice(t("terminal.herdrReady"));
        check();
        return;
      }
      if (!initial.ready) {
        setNotice(t("terminal.herdrBusy"));
        check();
        return;
      }
      await api.launchTerminalHerdr(pane.sessionId, initial.revision);
      if (stillCurrent()) pane.focus();
      setNotice("");
      check();
    } catch (error) {
      setNotice(getErrorMessage(error, t("common.error")));
    } finally {
      document.removeEventListener("focusin", focus);
      window.removeEventListener("blur", blur);
      inFlight.current = false;
      setBusy(false);
    }
  };
  const upgrade = async () => {
    if (inFlight.current) return;
    if (!update?.managed) {
      setNotice(t("terminal.herdrExternalUpdate"));
      return;
    }
    inFlight.current = true;
    checkRevision.current += 1;
    setBusy(true);
    setNotice(t("terminal.herdrUpdating"));
    try {
      await api.updateHerdr();
      setUpdate(null);
      setNotice(t("terminal.herdrUpdated"));
    } catch (error) {
      setNotice(getErrorMessage(error, t("common.error")));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, notice, update, launch, upgrade };
}
