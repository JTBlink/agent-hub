// @vitest-environment jsdom
import { act, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import * as api from "../api";
import { createTerminalTab } from "../../../lib/terminalLayout";
import { useHerdrSessions } from "./useHerdrSessions";
import type { PaneControl } from "../../../components/terminal/TerminalPane";

vi.mock("../api", () => ({
  getHerdrInventory: vi.fn(),
  terminalLaunchState: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  openHerdrWorkspace: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
  prepareHerdrSession: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("switches only the selected pane, preserves other clients and discards stale or busy-shell requests", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const tab = createTerminalTab("demo", undefined, "/projects/demo");
  tab.panes.push("other-pane");
  const opened: api.HerdrOpenedWorkspace = {
    project_id: "demo",
    path: "/projects/demo",
    target: {
      session: "default",
      workspace_id: "w1",
      pane_id: "w1:p1",
      terminal_id: "term1",
      revision: 1,
      agent_session: null,
    },
  };
  const control: PaneControl = {
    sessionId: "shell",
    cwd: "/projects/previous",
    focus: vi.fn(),
    ownsFocus: () => true,
    inputRevision: () => 0,
  };
  vi.mocked(api.prepareHerdrSession).mockResolvedValue("default");
  const fallback = vi.fn();
  vi.mocked(api.getHerdrInventory).mockResolvedValue({
    installed: true,
    sessions: [
      { name: "default", default: true, running: true },
      { name: "old-session", default: false, running: true },
    ],
  });
  vi.mocked(api.terminalLaunchState).mockResolvedValue({
    ready: true,
    herdr_active: false,
    revision: 1,
  });
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "1",
    tabs: [],
    agents: [],
    panes: [],
    workspaces: [
      {
        workspace_id: "w1",
        label: "Review",
        directory: opened.path,
        branch: "main",
        active_tab_id: "w1:t1",
      },
    ],
  });
  vi.mocked(api.ensureHerdrWorkspace).mockResolvedValue(opened);
  let result!: ReturnType<typeof useHerdrSessions>;
  let displayed = tab;
  let reset!: () => void;
  let addExisting!: () => string;
  const select = vi.fn();
  function Harness() {
    const [tabs, setTabs] = useState([tab]);
    const tabsRef = useRef(tabs);
    useLayoutEffect(() => {
      tabsRef.current = tabs;
    }, [tabs]);
    const value = useHerdrSessions(
      true,
      tabs[0],
      () => control,
      setTabs,
      tabsRef,
      select,
    );
    useLayoutEffect(() => {
      reset = () => setTabs([tab]);
      addExisting = () => {
        const client = {
          ...createTerminalTab("demo", undefined, opened.path),
          herdrTarget: opened.target,
        };
        setTabs([tab, client]);
        return client.id;
      };
      displayed = tabs[0];
      result = value;
    });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => result.openDefault(fallback));
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledWith(
      "default",
      "demo",
      "/projects/demo",
    );
    expect(api.openHerdrWorkspace).not.toHaveBeenCalled();
    expect(api.getHerdrSnapshot).not.toHaveBeenCalled();
    expect(displayed.id).toBe(tab.id);
    expect(displayed.projectId).toBe("demo");
    expect(displayed.panes).toEqual(tab.panes);
    expect(result.paneProps(displayed, tab.activePane).herdrTarget).toEqual(
      opened.target,
    );
    expect(
      result.paneProps(displayed, "other-pane").herdrTarget,
    ).toBeUndefined();
    control.herdrTarget = opened.target;
    await act(async () => result.openDefault(fallback));
    expect(control.focus).toHaveBeenCalledOnce();
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledTimes(2);
    delete control.herdrTarget;
    await act(async () => reset());
    vi.mocked(api.terminalLaunchState).mockResolvedValue({
      ready: false,
      herdr_active: false,
      revision: 2,
    });
    await act(async () => result.openDefault(fallback));
    expect(result.notice).toBe("terminal.herdrBusy");
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledTimes(2);
    vi.mocked(api.terminalLaunchState).mockResolvedValue({
      ready: true,
      herdr_active: false,
      revision: 3,
    });
    let finish!: (value: api.HerdrOpenedWorkspace) => void;
    vi.mocked(api.ensureHerdrWorkspace).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.openDefault(fallback);
    });
    control.inputRevision = () => 1;
    await act(async () => {
      finish({ ...opened, target: { ...opened.target, session: "default" } });
      await pending;
    });
    expect(
      result.paneProps(displayed, tab.activePane).herdrTarget?.session,
    ).toBeUndefined();
    let existingId = "";
    await act(async () => {
      existingId = addExisting();
    });
    vi.mocked(api.terminalLaunchState).mockResolvedValue({
      ready: false,
      herdr_active: false,
      revision: 4,
    });
    const reads = vi.mocked(api.terminalLaunchState).mock.calls.length;
    await act(async () => result.openDefault(fallback));
    expect(select).toHaveBeenLastCalledWith(existingId);
    expect(api.terminalLaunchState).toHaveBeenCalledTimes(reads);
    expect(
      result.paneProps(displayed, tab.activePane).herdrTarget,
    ).toBeUndefined();
    vi.mocked(api.getHerdrInventory).mockResolvedValue({
      installed: false,
      sessions: [],
    });
    await act(async () => result.openDefault(fallback));
    expect(select).toHaveBeenLastCalledWith(existingId);
    expect(fallback).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  }
});
