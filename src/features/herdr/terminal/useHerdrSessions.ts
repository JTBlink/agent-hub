import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { DEFAULT_HERDR_SESSION } from "../lib/herdrControlApi";
import { getErrorMessage } from "../../../lib/error";
import type { TerminalTab } from "../../../lib/terminalLayout";
import type { PaneControl } from "../../../components/terminal/TerminalPane";
import { attachHerdrClient, findHerdrClient } from "./herdrClientTabs";

/** Toolbar entry shares the same session client registry as menu and sidebar attachments. */
export function useHerdrSessions(
  visible: boolean,
  tab: TerminalTab | undefined,
  current: () => PaneControl | null,
  setTabs: Dispatch<SetStateAction<TerminalTab[]>>,
  tabs: RefObject<TerminalTab[]>,
  selectTab: (id: string) => void,
) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const latest = useRef({ visible, tab, current });
  useLayoutEffect(() => {
    latest.current = { visible, tab, current };
  });
  const selection = useRef(0);
  useLayoutEffect(() => {
    selection.current += 1;
  }, [visible, tab?.activePane]);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const openDefault = async (fallback: () => Promise<void>) => {
    const session = DEFAULT_HERDR_SESSION;
    if (pending.current) return;
    const scope = latest.current;
    const pane = scope.current();
    if (!scope.visible || !scope.tab || !pane) return;
    const activeTab = scope.tab;
    const selectionRevision = selection.current;
    const input = pane.inputRevision();
    const valid = () =>
      mounted.current &&
      selection.current === selectionRevision &&
      latest.current.visible &&
      latest.current.tab?.activePane === activeTab.activePane &&
      latest.current.current() === pane &&
      pane.inputRevision() === input;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      const initial =
        pane.herdrTarget || findHerdrClient(tabs.current, session)
          ? null
          : await api.terminalLaunchState(pane.sessionId);
      if (initial && !initial.ready && !initial.herdr_active)
        throw new Error(t("terminal.herdrBusy"));
      const inventory = await api.getHerdrInventory();
      if (!valid()) return;
      if (!inventory.installed) {
        const existing = findHerdrClient(tabs.current, session);
        if (existing) {
          selectTab(existing.tab.id);
          return;
        }
        await fallback();
        if (valid())
          setTabs((tabs) =>
            tabs.map((item) =>
              item.id === activeTab.id
                ? { ...item, herdrSession: session }
                : item,
            ),
          );
        return;
      }
      await api.prepareHerdrSession();
      if (!valid()) return;
      const opened = await api.ensureHerdrWorkspace(
        session,
        activeTab.projectId,
        activeTab.worktreePath,
      );
      if (!valid()) return;
      if (initial) {
        const state = await api.terminalLaunchState(pane.sessionId);
        if (!valid()) return;
        if (
          state.revision !== initial.revision ||
          (!state.ready && !state.herdr_active)
        )
          throw new Error(t("terminal.herdrBusy"));
      }
      const preferred = { tab: activeTab, pane: activeTab.activePane };
      const client = attachHerdrClient(tabs.current, opened, preferred);
      setTabs(
        (previous) => attachHerdrClient(previous, opened, preferred).tabs,
      );
      selectTab(client.tabId);
      if (
        pane.herdrTarget?.session === session &&
        pane.herdrTarget.workspace_id === opened.target.workspace_id
      )
        pane.focus();
    } catch (error) {
      if (valid()) setNotice(getErrorMessage(error, t("common.error")));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const paneProps = (tab: TerminalTab, pane: string) => {
    const attachment = tab.paneAttachments?.[pane];
    return {
      projectId: attachment?.project_id ?? tab.projectId,
      worktreePath: attachment?.path ?? tab.worktreePath,
      agent: attachment ? undefined : tab.agent,
      herdrTarget: attachment?.target ?? tab.herdrTarget,
    };
  };
  return {
    busy,
    notice,
    openDefault,
    paneProps,
    target: tab?.paneAttachments?.[tab.activePane]?.target,
  };
}
