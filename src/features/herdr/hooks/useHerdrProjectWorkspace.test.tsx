// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import * as api from "../api";
import { useHerdrProjectWorkspace } from "./useHerdrProjectWorkspace";

vi.mock("../api", () => ({
  prepareHerdrSession: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
}));

it("serializes focus changes, drops superseded requests and ignores stale results", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.mocked(api.prepareHerdrSession).mockResolvedValue("default");
  const opened: api.HerdrOpenedWorkspace = {
    project_id: "demo",
    path: "/projects/first",
    target: {
      session: "default",
      workspace_id: "w1",
      pane_id: "w1:p1",
      terminal_id: "native",
      revision: 1,
      agent_session: null,
    },
  };
  let finish!: (value: api.HerdrOpenedWorkspace) => void;
  vi.mocked(api.ensureHerdrWorkspace)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue({ ...opened, path: "/projects/latest" });
  const onReady = vi.fn(),
    onError = vi.fn(),
    refresh = vi.fn();
  const root = createRoot(document.createElement("div"));
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
  const render = async (path: string, enabled = true) => {
    await act(async () =>
      root.render(<Harness path={path} enabled={enabled} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
  };
  try {
    await render(opened.path, false);
    expect(api.prepareHerdrSession).not.toHaveBeenCalled();
    await render(opened.path);
    await render("/projects/intermediate");
    await render("/projects/latest");
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledOnce();
    await act(async () => finish(opened));
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledTimes(2);
    expect(api.ensureHerdrWorkspace).toHaveBeenLastCalledWith(
      "default",
      "demo",
      "/projects/latest",
    );
    expect(onReady).toHaveBeenCalledExactlyOnceWith({
      ...opened,
      path: "/projects/latest",
    });
    await render("/projects/latest", false);
    await render("/projects/latest");
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
