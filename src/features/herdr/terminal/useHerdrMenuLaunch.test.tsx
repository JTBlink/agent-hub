// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { useHerdrMenuLaunch } from "./useHerdrMenuLaunch";
import * as api from "../api";
import { getAgentLaunchSettings } from "../../../lib/tauri";
import { openProjectHerdrAgent } from "../lib/projectAgent";
import { makeTool } from "../../../../tests/fixtures/workspace";
vi.mock("../../../lib/tauri", () => ({ getAgentLaunchSettings: vi.fn() }));
vi.mock("../lib/projectAgent", () => ({ openProjectHerdrAgent: vi.fn() }));
vi.mock("../api", () => ({
  getHerdrInventory: vi.fn(),
  installHerdr: vi.fn(),
  prepareHerdrSession: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
}));
it("opens the default session through a verified attachment and discards a late result after switching projects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api.getHerdrInventory).mockResolvedValue({
    installed: true,
    sessions: [],
  });
  vi.mocked(api.prepareHerdrSession).mockResolvedValue("default");
  vi.mocked(getAgentLaunchSettings).mockResolvedValue({
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
    revision: "one",
    defaults: {},
  });
  const opened = {
    project_id: "demo",
    path: "/projects/demo",
    target: {
      session: "default",
      workspace_id: "w1",
      pane_id: "w1:p1",
      terminal_id: "one",
      revision: 1,
      agent_session: null,
    },
  };
  vi.mocked(openProjectHerdrAgent).mockResolvedValue({
    ...opened,
    warning: "",
  });
  const select = vi.fn();
  function Harness({ project }: { project: string }) {
    const launch = useHerdrMenuLaunch(project, `/projects/${project}`, select, [
      makeTool("codex"),
    ]);
    const location = useLocation();
    return (
      <>
        <button onClick={() => void launch.open()} disabled={launch.busy}>
          Herdr
        </button>
        <output>{JSON.stringify(location.state)}</output>
      </>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (project: string) =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <Harness project={project} />
        </MemoryRouter>,
      ),
    );
  try {
    await render("demo");
    expect(api.getHerdrInventory).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(openProjectHerdrAgent).toHaveBeenCalledWith(
      "demo",
      "/projects/demo",
      "codex",
      expect.any(Function),
    );
    expect(JSON.parse(host.querySelector("output")!.textContent!)).toEqual({
      preserveSidebar: true,
      herdrAttachment: {
        ...opened,
        warning: "",
      },
    });
    expect(select).toHaveBeenCalledOnce();
    let resolve!: (value: typeof opened & { warning: string }) => void;
    vi.mocked(openProjectHerdrAgent).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => host.querySelector("button")!.click());
    await render("other");
    await act(async () => resolve({ ...opened, warning: "" }));
    expect(select).toHaveBeenCalledOnce();
    expect(api.installHerdr).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
