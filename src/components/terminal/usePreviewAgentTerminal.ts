import {
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { listenPreviewAgent } from "../../lib/previewAgentDelivery";
import { PreviewAgentRuntime } from "./previewAgentRuntime";
import type { TerminalTab } from "../../lib/terminalLayout";
import type { Project, ToolInfo } from "../../lib/tauri";
import type { PaneControl } from "./TerminalPane";

export function usePreviewAgentTerminal(options: {
  ready: boolean;
  projects: Project[];
  tools: readonly ToolInfo[];
  projectId?: string;
  path?: string;
  tabs: RefObject<TerminalTab[]>;
  controls: RefObject<Map<string, PaneControl>>;
  setTabs: Dispatch<SetStateAction<TerminalTab[]>>;
}) {
  const live = useRef(options);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    live.current = options;
  });
  useEffect(() => {
    mounted.current = true;
    const runtime = new PreviewAgentRuntime({
      tabs: () => live.current.tabs.current,
      controls: () => live.current.controls.current,
      tools: () => live.current.tools,
      update: (change) => {
        if (!mounted.current) return;
        live.current.tabs.current = change(live.current.tabs.current);
        live.current.setTabs(change);
      },
    });
    const stop = listenPreviewAgent((request) => {
      const current = live.current;
      const projectId =
        request.page.projectId ??
        (current.path === request.workspacePath
          ? current.projectId
          : undefined) ??
        current.tabs.current.find(
          (tab) => tab.worktreePath === request.workspacePath,
        )?.projectId ??
        current.projects.find(
          (project) => project.path === request.workspacePath,
        )?.id;
      if (!projectId) return null;
      if (!current.ready)
        return Promise.reject(Error("PREVIEW_AGENT_WORKSPACE_UNAVAILABLE"));
      return (
        request.preview
          ? runtime.preview.bind(runtime)
          : runtime.deliver.bind(runtime)
      )(
        {
          ...request,
          verify: async () => {
            if (
              !mounted.current ||
              !live.current.projects.some(
                (project) => project.id === projectId,
              ) ||
              live.current.projectId !== current.projectId ||
              live.current.path !== current.path
            )
              throw Error("PREVIEW_CONTEXT_CHANGED");
            await request.verify();
          },
        },
        projectId,
      );
    });
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
}
