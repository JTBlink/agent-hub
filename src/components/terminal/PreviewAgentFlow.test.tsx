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
let backendName: string | undefined;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  backendName = undefined;
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
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "terminal_list") return [];
    if (command === "agent_launch_settings")
      return { document: { default_agent: "codex" } };
    if (command === "herdr_inventory")
      return {
        installed: true,
        sessions: [{ name: "default", running: true, default: true }],
      };
    if (command === "herdr_ensure")
      return {
        project_id: project.id,
        path: project.path,
        target: { ...target, pane_id: "shell" },
      };
    if (command === "herdr_start_agent") {
      if (
        args &&
        "input" in args &&
        args.input &&
        typeof args.input === "object" &&
        "name" in args.input &&
        typeof args.input.name === "string"
      )
        backendName = args.input.name;
      return { target, warning: null };
    }
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
        agents: [
          { ...target, name: backendName, agent: "codex", cwd: project.path },
        ],
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

it.each(["ready", "lost frontend binding", "replaced", "missing", "uncertain"])(
  "checks the %s file binding after a frontend reload without starting another Agent",
  async (state) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const view = () => (
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
      </MemoryRouter>
    );
    const page = {
      id: "document",
      title: "Page task",
      path: "/projects/site/index.html",
      projectId: project.id,
    };
    try {
      const original = vi.mocked(invoke).getMockImplementation()!;
      if (state === "uncertain")
        vi.mocked(invoke).mockImplementation((name, args) =>
          name === "herdr_start_agent"
            ? Promise.resolve({ target, warning: "unknown delivery result" })
            : original(name, args),
        );
      await act(async () => root.render(view()));
      const first = await embeddedAgentDeliveryAdapter.resolveCurrent(
        project.path,
        page,
      );
      await act(async () => {
        if (state === "uncertain")
          await expect(first!.send("First feedback")).rejects.toThrow(
            "PREVIEW_AGENT_UNCERTAIN",
          );
        else await first!.send("First feedback");
      });
      expect(JSON.stringify(localStorage)).not.toContain("First feedback");
      const attached = vi
        .mocked(invoke)
        .mock.calls.filter(([name]) => name === "herdr_terminal_create").length;
      await act(async () => root.render(null));
      sessionStorage.clear();
      if (state === "lost frontend binding")
        localStorage.removeItem("agent-hub:preview-agents");
      await act(async () => root.render(view()));
      expect(
        vi
          .mocked(invoke)
          .mock.calls.filter(([name]) => name === "herdr_terminal_create"),
      ).toHaveLength(attached);
      if (state === "replaced" || state === "missing")
        vi.mocked(invoke).mockImplementation((name, args) =>
          name === "herdr_snapshot"
            ? Promise.resolve({
                workspaces: [{ workspace_id: "site", directory: project.path }],
                agents:
                  state === "missing"
                    ? []
                    : [
                        {
                          ...target,
                          agent: "codex",
                          cwd: project.path,
                          agent_session: { id: "replacement" },
                        },
                      ],
              })
            : original(name, args),
        );
      const second = await embeddedAgentDeliveryAdapter.resolveCurrent(
        project.path,
        { ...page, id: "reopened-document" },
      );
      await act(async () => {
        if (state === "ready" || state === "lost frontend binding")
          await second!.send("Follow-up feedback");
        else
          await expect(second!.send("Follow-up feedback")).rejects.toThrow(
            state === "uncertain"
              ? "PREVIEW_AGENT_UNCERTAIN"
              : "PREVIEW_AGENT_PANE_CHANGED",
          );
      });
      expect(
        vi
          .mocked(invoke)
          .mock.calls.filter(([name]) => name === "herdr_start_agent"),
      ).toHaveLength(1);
      if (state === "ready" || state === "lost frontend binding")
        expect(invoke).toHaveBeenCalledWith("herdr_action", {
          target,
          action: "prompt",
          text: "Follow-up feedback",
        });
      else
        expect(
          vi
            .mocked(invoke)
            .mock.calls.filter(([name]) => name === "herdr_action"),
        ).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
