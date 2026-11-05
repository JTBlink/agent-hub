import {
  useEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  listenDevelopment,
  listenDevelopmentLogHide,
  waitDevelopment,
} from "../../lib/developmentPreview";
import {
  createTerminalTab,
  TERMINAL_PANE_LIMIT,
  terminalScopeKey,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { useTranslation } from "react-i18next";

/** Services keep an owned PTY in the background; logs are shown only on demand or failure. */
export function useDevelopmentTerminal({
  ready,
  projectId,
  path,
  tabs,
  setTabs,
  setActiveId,
  onSelectTerminal,
}: {
  ready: boolean;
  projectId?: string;
  path?: string;
  tabs: RefObject<TerminalTab[]>;
  setTabs: Dispatch<SetStateAction<TerminalTab[]>>;
  setActiveId: (id: string) => void;
  onSelectTerminal?: () => void;
}) {
  const { t } = useTranslation();
  useEffect(
    () =>
      listenDevelopmentLogHide((scope, port) => {
        if (scope !== terminalScopeKey(projectId, path)) return;
        setTabs((previous) =>
          previous.map((tab) =>
            tab.development?.launch.port === port && tab.developmentVisible
              ? { ...tab, developmentVisible: false }
              : tab,
          ),
        );
      }),
    [projectId, path, setTabs],
  );
  useEffect(
    () =>
      listenDevelopment((request) => {
        if (request.projectId !== projectId || request.worktreePath !== path) {
          request.reject(new Error(t("terminal.chooseProject")));
          return;
        }
        if (
          !ready ||
          tabs.current.reduce((sum, tab) => sum + tab.panes.length, 0) >=
            TERMINAL_PANE_LIMIT
        ) {
          request.reject(
            new Error(t(ready ? "worktree.terminalLimit" : "common.loading")),
          );
          return;
        }
        const tab = createTerminalTab(projectId, undefined, path);
        tab.title = t("fileTree.developmentTerminal");
        let settled = false;
        const failed = (reason: unknown) => {
          if (!settled) {
            settled = true;
            if (tabs.current.some((item) => item.id === tab.id)) {
              setTabs((previous) =>
                previous.map((item) =>
                  item.id === tab.id
                    ? { ...item, developmentVisible: true }
                    : item,
                ),
              );
              setActiveId(tab.id);
              onSelectTerminal?.();
            }
            request.reject(reason);
          }
        };
        tab.development = {
          launch: request.plan.launch,
          started: () => {
            void waitDevelopment(request.plan.launch.port).then(() => {
              if (!settled) {
                settled = true;
                request.resolve();
              }
            }, failed);
          },
          failed,
        };
        // Reserve synchronously so simultaneous previews respect the shared pane limit.
        tabs.current = [...tabs.current, tab];
        setTabs((previous) => [...previous, tab]);
      }),
    [ready, projectId, path, tabs, setTabs, setActiveId, onSelectTerminal, t],
  );
}
