// @vitest-environment jsdom
import { act, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { useHerdrAttachment } from "./useHerdrAttachment";
import {
  type TerminalTab,
  createTerminalTab,
} from "../../../lib/terminalLayout";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it.each([false, true])(
  "preserves the existing client when newTab is %s and reports startup warnings",
  async (newTab) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const target = {
      session: "default",
      workspace_id: "w1",
      pane_id: "w1:p1",
      terminal_id: "one",
      revision: 1,
      agent_session: null,
    };
    const initial = {
      ...createTerminalTab("demo", undefined, "/projects/demo"),
      herdrTarget: target,
    };
    const error = vi.fn();
    function Harness() {
      const [tabs, setTabs] = useState<TerminalTab[]>([initial]);
      const tabRef = useRef(tabs);
      const initialized = useRef(false);
      useLayoutEffect(() => {
        tabRef.current = tabs;
      }, [tabs]);
      useHerdrAttachment({
        ready: true,
        visible: true,
        projectId: "demo",
        path: "/projects/demo",
        tabs: tabRef,
        setTabs,
        setActiveIds: () => {},
        rememberActive: () => {},
        initializedRef: initialized,
        onError: error,
      });
      return <output>{tabs.length}</output>;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <MemoryRouter
            initialEntries={[
              {
                pathname: "/project/demo",
                state: {
                  herdrAttachment: {
                    project_id: "demo",
                    path: "/projects/demo",
                    target,
                    newTab,
                    warning: "Inspect startup",
                  },
                },
              },
            ]}
          >
            <Harness />
          </MemoryRouter>,
        ),
      );
      expect(host.textContent).toBe(newTab ? "2" : "1");
      expect(error).toHaveBeenCalledWith("Inspect startup");
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
