import { beforeEach, expect, it, vi } from "vitest";
import { PreviewAgentRuntime } from "./previewAgentRuntime";
import {
  getHerdrInventory,
  getHerdrSnapshot,
  ensureHerdrWorkspace,
  startHerdrAgent,
  runHerdrAction,
  type HerdrTarget,
  type HerdrSnapshot,
} from "@app/herdr";
import {
  getAgentLaunchSettings,
  getAgentLaunchPlan,
  submitTerminalAgentPrompt,
  type ToolInfo,
} from "../../lib/tauri";
import { createTerminalTab, type TerminalTab } from "../../lib/terminalLayout";
import type { PreviewAgentRequest } from "../../lib/previewAgentDelivery";
import type { PaneControl } from "./TerminalPane";
vi.mock("@app/herdr", async () => ({
  embeddedWorkspaceAgent: (await import("../../features/herdr/deliveryAdapter"))
    .embeddedWorkspaceAgent,
  DEFAULT_HERDR_SESSION: "default",
  getHerdrInventory: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
  startHerdrAgent: vi.fn(),
  runHerdrAction: vi.fn(),
}));
vi.mock("../../lib/tauri", () => ({
  getAgentLaunchSettings: vi.fn(),
  getAgentLaunchPlan: vi.fn(),
  submitTerminalAgentPrompt: vi.fn(),
}));
const target = (id = "one"): HerdrTarget => ({
  session: "default",
  workspace_id: "site",
  pane_id: id,
  terminal_id: `terminal-${id}`,
  revision: 1,
  agent_session: { id },
});
const snapshot = (...targets: HerdrTarget[]): HerdrSnapshot => ({
  version: "1",
  workspaces: [
    {
      workspace_id: "site",
      label: "Site",
      branch: "main",
      directory: "/workspace/site",
      active_tab_id: "tab",
    },
  ],
  tabs: [],
  panes: [],
  agents: targets.map((value) => ({
    ...value,
    tab_id: "tab",
    focused: true,
    agent: "codex",
    name: "Agent",
    agent_status: "idle",
    cwd: "/workspace/site",
  })),
});
const tool: ToolInfo = {
  key: "codex",
  display_name: "Codex",
  installed: true,
  enabled: true,
  skills_dir: "",
  is_custom: false,
  has_path_override: false,
  has_project_path_override: false,
  project_relative_skills_dir: null,
  category: "coding",
};
let tabs: TerminalTab[],
  controls: Map<string, PaneControl>,
  runtime: PreviewAgentRuntime;
let onUpdate: () => void;
const request = (id = "page"): PreviewAgentRequest => ({
  workspacePath: "/workspace/site",
  page: { id, title: `Page ${id}` },
  prompt: "Fix this layout",
  verify: vi.fn(async () => {}),
});
beforeEach(() => {
  vi.resetAllMocks();
  tabs = [];
  controls = new Map();
  onUpdate = () => {};
  runtime = new PreviewAgentRuntime({
    tabs: () => tabs,
    update: (change) => {
      tabs = change(tabs);
      onUpdate();
    },
    tools: () => [tool],
    controls: () => controls,
  });
  vi.mocked(getAgentLaunchSettings).mockResolvedValue({
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
    revision: "1",
    defaults: {},
  });
  vi.mocked(getHerdrInventory).mockResolvedValue({
    installed: true,
    sessions: [],
  });
  vi.mocked(ensureHerdrWorkspace).mockResolvedValue({
    project_id: "site",
    path: "/workspace/site",
    target: target("shell"),
  });
  vi.mocked(startHerdrAgent).mockResolvedValue({
    target: target(),
    warning: null,
  });
  vi.mocked(getHerdrSnapshot).mockResolvedValue(snapshot(target()));
});
it("creates one page task tab and reuses its exact Pane for follow-up", async () => {
  await runtime.deliver(request(), "site");
  expect(tabs).toHaveLength(1);
  expect(tabs[0].previewPageId).toBe("page");
  expect(tabs[0].herdrTarget).toEqual(target());
  expect(startHerdrAgent).toHaveBeenCalledExactlyOnceWith(
    target("shell"),
    expect.objectContaining({ kind: "codex", prompt: "Fix this layout" }),
  );
  await runtime.deliver(request(), "site");
  expect(startHerdrAgent).toHaveBeenCalledOnce();
  expect(runHerdrAction).toHaveBeenCalledExactlyOnceWith(
    target(),
    "prompt",
    "Fix this layout",
  );
});
it("keeps different pages in separate Panes and ignores focus elsewhere", async () => {
  await runtime.deliver(request("first"), "site");
  vi.mocked(startHerdrAgent).mockResolvedValue({
    target: target("two"),
    warning: null,
  });
  await runtime.deliver(request("second"), "site");
  expect(tabs.map((tab) => tab.previewPageId)).toEqual(["first", "second"]);
  expect(startHerdrAgent).toHaveBeenCalledTimes(2);
  vi.mocked(getHerdrSnapshot).mockResolvedValue(
    snapshot(target(), target("two")),
  );
  await runtime.deliver(request("first"), "site");
  expect(runHerdrAction).toHaveBeenLastCalledWith(
    target(),
    "prompt",
    "Fix this layout",
  );
});
it("binds a single suitable embedded Agent without starting another", async () => {
  tabs = [
    {
      ...createTerminalTab("site", undefined, "/workspace/site"),
      herdrTarget: target(),
    },
  ];
  await runtime.deliver(request(), "site");
  expect(startHerdrAgent).not.toHaveBeenCalled();
  expect(runHerdrAction).toHaveBeenCalledOnce();
  expect(tabs[0].previewPageId).toBe("page");
});
it("does not mistake an empty Shell workspace for an Agent", async () => {
  vi.mocked(getHerdrSnapshot).mockResolvedValue(snapshot());
  tabs = [
    {
      ...createTerminalTab("site", undefined, "/workspace/site"),
      herdrTarget: target("shell"),
    },
  ];
  await runtime.deliver(request(), "site");
  expect(startHerdrAgent).toHaveBeenCalledOnce();
  expect(runHerdrAction).not.toHaveBeenCalled();
});
it("finds an existing Agent within an embedded workspace attached at its Shell", async () => {
  tabs = [
    {
      ...createTerminalTab("site", undefined, "/workspace/site"),
      herdrTarget: target("shell"),
    },
  ];
  await runtime.deliver(request(), "site");
  expect(startHerdrAgent).not.toHaveBeenCalled();
  expect(tabs[0].herdrTarget).toEqual(target());
  expect(runHerdrAction).toHaveBeenCalledExactlyOnceWith(
    target(),
    "prompt",
    "Fix this layout",
  );
});
it("preserves an uncertain launch and never creates or submits it again", async () => {
  vi.mocked(startHerdrAgent).mockResolvedValue({
    target: target(),
    warning: "startup result unknown",
  });
  await expect(runtime.deliver(request(), "site")).rejects.toThrow(
    "PREVIEW_AGENT_UNCERTAIN",
  );
  expect(tabs[0].herdrTarget).toEqual(target());
  await expect(runtime.deliver(request(), "site")).rejects.toThrow(
    "PREVIEW_AGENT_UNCERTAIN",
  );
  expect(startHerdrAgent).toHaveBeenCalledOnce();
  expect(runHerdrAction).not.toHaveBeenCalled();
});
it("rejects replaced Agent identities instead of following workspace focus", async () => {
  await runtime.deliver(request(), "site");
  vi.mocked(getHerdrSnapshot).mockResolvedValue(
    snapshot({ ...target(), agent_session: { id: "replacement" } }),
  );
  await expect(runtime.deliver(request(), "site")).rejects.toThrow(
    "PREVIEW_AGENT_PANE_CHANGED",
  );
  expect(runHerdrAction).not.toHaveBeenCalled();
  expect(startHerdrAgent).toHaveBeenCalledOnce();
});
it("rechecks context after workspace preparation and releases an unused reservation", async () => {
  const input = request();
  vi.mocked(input.verify)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("changed"));
  await expect(runtime.deliver(input, "site")).rejects.toThrow("changed");
  expect(tabs).toHaveLength(0);
  expect(startHerdrAgent).not.toHaveBeenCalled();
});
it("respects terminal capacity before workspace creation", async () => {
  tabs = Array.from({ length: 8 }, () =>
    createTerminalTab("site", undefined, "/workspace/site"),
  );
  await expect(runtime.deliver(request(), "site")).rejects.toThrow(
    "PREVIEW_AGENT_LIMIT",
  );
  expect(ensureHerdrWorkspace).not.toHaveBeenCalled();
  expect(startHerdrAgent).not.toHaveBeenCalled();
});
it("launches native initial prompts once and uses guarded native follow-up", async () => {
  vi.mocked(getHerdrInventory).mockResolvedValue({
    installed: false,
    sessions: [],
  });
  onUpdate = () => {
    const tab = tabs.find((tab) => tab.nativeTask);
    if (tab) {
      controls.set(tab.panes[0], {
        sessionId: "owned-native",
        cwd: "/workspace/site",
        focus: () => {},
        inputRevision: () => 0,
        ownsFocus: () => false,
      });
      queueMicrotask(() => tab.nativeTask?.started());
    }
  };
  await runtime.deliver(request(), "site");
  expect(tabs[0].nativeTask?.prompt).toBe("Fix this layout");
  await runtime.deliver(request(), "site");
  expect(submitTerminalAgentPrompt).toHaveBeenCalledExactlyOnceWith(
    "owned-native",
    "Fix this layout",
  );
  expect(startHerdrAgent).not.toHaveBeenCalled();
  expect(tabs).toHaveLength(1);
});
it("blocks concurrent submissions during target preparation", async () => {
  let finish!: () => void;
  vi.mocked(ensureHerdrWorkspace).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            project_id: "site",
            path: "/workspace/site",
            target: target("shell"),
          });
      }),
  );
  const pending = runtime.deliver(request(), "site");
  await vi.waitFor(() => expect(ensureHerdrWorkspace).toHaveBeenCalled());
  await expect(runtime.deliver(request(), "site")).rejects.toThrow(
    "PREVIEW_AGENT_BUSY",
  );
  finish();
  await pending;
  expect(startHerdrAgent).toHaveBeenCalledOnce();
});
it("creates a dedicated file-named tab and reuses it across preview identities", async () => {
  tabs = [
    {
      ...createTerminalTab("site", undefined, "/workspace/site"),
      herdrTarget: target("other"),
    },
  ];
  const first = request("preview-one");
  first.page = {
    ...first.page,
    path: "/workspace/site/design.html",
    title: "Page title",
  };
  await runtime.deliver(first, "site");
  expect(tabs).toHaveLength(2);
  expect(tabs[1].title).toBe("design.html");
  expect(tabs[1].previewPageId).toBe("file:/workspace/site/design.html");
  await runtime.deliver(
    { ...first, page: { ...first.page, id: "preview-two" } },
    "site",
  );
  expect(startHerdrAgent).toHaveBeenCalledOnce();
  expect(runHerdrAction).toHaveBeenCalledOnce();
  vi.mocked(startHerdrAgent).mockResolvedValue({
    target: target("two"),
    warning: null,
  });
  await runtime.deliver(
    {
      ...first,
      page: { ...first.page, path: "/workspace/site/other/design.html" },
    },
    "site",
  );
  expect(tabs).toHaveLength(3);
  expect(startHerdrAgent).toHaveBeenCalledTimes(2);
});
it("keeps selected Agent kinds in separate tabs and returns to the original context", async () => {
  runtime = new PreviewAgentRuntime({
    tabs: () => tabs,
    controls: () => controls,
    tools: () => [tool, { ...tool, key: "claude_code" }],
    update: (change) => {
      tabs = change(tabs);
    },
  });
  await runtime.deliver({ ...request(), agentId: "codex" }, "site");
  vi.mocked(startHerdrAgent).mockResolvedValue({
    target: target("claude"),
    warning: null,
  });
  await runtime.deliver({ ...request(), agentId: "claude" }, "site");
  expect(startHerdrAgent).toHaveBeenLastCalledWith(
    target("shell"),
    expect.objectContaining({ kind: "claude" }),
  );
  expect(tabs.map((tab) => tab.agent)).toEqual(["codex", "claude"]);
  await runtime.deliver({ ...request(), agentId: "codex" }, "site");
  expect(startHerdrAgent).toHaveBeenCalledTimes(2);
  expect(runHerdrAction).toHaveBeenLastCalledWith(
    target(),
    "prompt",
    "Fix this layout",
  );
});
it("does not silently substitute another Agent when the selected kind is unavailable", async () => {
  await expect(
    runtime.deliver({ ...request(), agentId: "claude" }, "site"),
  ).rejects.toThrow("PREVIEW_AGENT_NOT_INSTALLED");
  expect(startHerdrAgent).not.toHaveBeenCalled();
  expect(tabs).toHaveLength(0);
});
it("previews resolved launch parameters and existing-pane commands without creating or sending anything", async () => {
  vi.mocked(getAgentLaunchPlan).mockResolvedValue({
    key: "codex",
    kind: "codex",
    program: "codex",
    arguments: ["--configured-option"],
  });
  const fresh = await runtime.preview(request(), "site");
  expect(fresh.command).toContain("--configured-option");
  expect(fresh.command).toContain("Fix this layout");
  expect(fresh.createsWorkspace).toBe(true);
  expect(ensureHerdrWorkspace).not.toHaveBeenCalled();
  expect(startHerdrAgent).not.toHaveBeenCalled();
  expect(runHerdrAction).not.toHaveBeenCalled();
  expect(tabs).toHaveLength(0);
  await runtime.deliver(request(), "site");
  vi.clearAllMocks();
  vi.mocked(getAgentLaunchSettings).mockResolvedValue({
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
    revision: "1",
    defaults: {},
  });
  vi.mocked(getAgentLaunchPlan).mockResolvedValue({
    key: "codex",
    kind: "codex",
    program: "codex",
    arguments: [],
  });
  vi.mocked(getHerdrSnapshot).mockResolvedValue(snapshot(target()));
  vi.mocked(getHerdrInventory).mockResolvedValue({
    installed: true,
    sessions: [],
  });
  const bound = await runtime.preview(request(), "site");
  expect(bound.command).toContain("agent prompt 'one'");
  expect(bound.command).not.toContain("agent start");
  expect(bound.createsWorkspace).toBe(false);
  expect(startHerdrAgent).not.toHaveBeenCalled();
  expect(runHerdrAction).not.toHaveBeenCalled();
});
