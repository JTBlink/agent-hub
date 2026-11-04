import {
  useEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  listenDevelopment,
  waitDevelopment,
} from "../../lib/developmentPreview";
import {
  createTerminalTab,
  TERMINAL_PANE_LIMIT,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { useTranslation } from "react-i18next";

/** A preview starts an ordinary owned PTY; closing its tab stops the service. */
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
        onSelectTerminal?.();
        // Reserve synchronously so simultaneous previews respect the shared pane limit.
        tabs.current = [...tabs.current, tab];
        setTabs((previous) => [...previous, tab]);
        setActiveId(tab.id);
      }),
    [ready, projectId, path, tabs, setTabs, setActiveId, onSelectTerminal, t],
  );
}
