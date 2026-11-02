// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ensureHerdrWorkspace,
  type HerdrOpenedWorkspace,
} from "../lib/herdrControlApi";
import { useHerdrProjectWorkspace } from "./useHerdrProjectWorkspace";
vi.mock("../lib/herdrControlApi", () => ({ ensureHerdrWorkspace: vi.fn() }));
it("maps projects and worktrees, ignores stale results and leaves other sessions untouched", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onReady = vi.fn(),
    onError = vi.fn(),
    refresh = vi.fn();
  const target = {
    session: "default",
    workspace_id: "w1",
    pane_id: "w1:p1",
    terminal_id: "term1",
    revision: 1,
    agent_session: null,
  };
  const first: HerdrOpenedWorkspace = {
    project_id: "demo",
    path: "/projects/demo",
    target,
  };
  const second: HerdrOpenedWorkspace = {
    project_id: "demo",
    path: "/projects/feature",
    target,
  };
  let finish!: (value: HerdrOpenedWorkspace) => void;
  vi.mocked(ensureHerdrWorkspace)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue(second);
  function Harness({
    path,
    enabled = true,
  }: {
    path: string;
    enabled?: boolean;
  }) {
    useHerdrProjectWorkspace({
      enabled,
      session: "default",
      projectId: "demo",
      path,
      onReady,
      onError,
      refresh,
    });
    return null;
  }
  try {
    await act(async () => root.render(<Harness path={first.path} />));
    await act(async () => root.render(<Harness path={second.path} />));
    expect(ensureHerdrWorkspace).toHaveBeenLastCalledWith(
      "default",
      "demo",
      second.path,
    );
    expect(onReady).toHaveBeenLastCalledWith(second);
    await act(async () => finish(first));
    expect(onReady).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(<Harness path="/projects/other" enabled={false} />),
    );
    expect(ensureHerdrWorkspace).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
