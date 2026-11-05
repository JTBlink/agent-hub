// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { embeddedAgentDeliveryAdapter } from "../../lib/previewAgentDelivery";
import { makeProject, makeTool } from "../../../tests/fixtures/workspace";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@xterm/xterm", async () => ({
  Terminal: (await import("../../test/terminalEmulator")).TerminalEmulator,
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    onContextLoss() {}
    dispose() {}
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));
const project = { ...makeProject(), id: "site", path: "/projects/site" };
const target = {
  session: "default",
  workspace_id: "site",
  pane_id: "agent",
  terminal_id: "terminal",
  revision: 1,
  agent_session: { id: "original" },
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "terminal_list") return [];
    if (command === "agent_launch_settings")
      return { document: { default_agent: "codex" } };
    if (command === "herdr_inventory") return { installed: true, sessions: [] };
    if (command === "herdr_ensure")
      return {
        project_id: project.id,
        path: project.path,
        target: { ...target, pane_id: "shell" },
      };
    if (command === "herdr_start_agent") return { target, warning: null };
    if (command === "herdr_terminal_create")
      return {
        id: "attached",
        project_id: project.id,
        cwd: project.path,
        exited: false,
      };
    if (command === "herdr_snapshot")
      return {
        workspaces: [{ workspace_id: "site", directory: project.path }],
        agents: [{ ...target, agent: "codex", cwd: project.path }],
      };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("receives preview delivery while the terminal is hidden and creates only its Agent client", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter
          initialEntries={[
            `/project/site?worktree=${encodeURIComponent(project.path)}`,
          ]}
        >
          <TerminalWorkspace
            projects={[project]}
            tools={[makeTool("codex")]}
            shown={false}
            content={<div>Preview page</div>}
          />
        </MemoryRouter>,
      ),
    );
    const receiver = await embeddedAgentDeliveryAdapter.resolveCurrent(
      project.path,
      { id: "page", title: "Page task", projectId: project.id },
    );
    expect(receiver).not.toBeNull();
    await act(async () => {
      await receiver!.send("Implement this feedback");
    });
    await act(async () => {
      await receiver!.send("Keep the buttons visible");
    });
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "herdr_start_agent"),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "terminal_create"),
    ).toHaveLength(0);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "herdr_terminal_create"),
    ).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("herdr_action", {
      target,
      action: "prompt",
      text: "Keep the buttons visible",
    });
    expect(host.textContent).toContain("Page task");
    expect(host.textContent).toContain("Preview page");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
