import { expect, it, vi } from "vitest";
import * as api from "../api";
import { openProjectHerdrAgent } from "./projectAgent";
vi.mock("../api", () => ({
  ensureHerdrWorkspace: vi.fn(),
  startHerdrAgent: vi.fn(),
  openHerdrWorkspace: vi.fn(),
}));
it.each(["/projects/demo", "/projects/demo-topic"])(
  "opens a new Agent tab in the requested checkout %s",
  async (path) => {
    const target = {
      session: "default",
      workspace_id: "w1",
      pane_id: "w1:p1",
      terminal_id: "t1",
      revision: 1,
      agent_session: null,
    };
    vi.mocked(api.ensureHerdrWorkspace).mockResolvedValue({
      project_id: "demo",
      path,
      target,
    });
    vi.mocked(api.startHerdrAgent).mockResolvedValue({
      target: { ...target, pane_id: "w1:p2" },
      warning: "Startup needs attention",
    });
    const started = await openProjectHerdrAgent(
      "demo",
      path,
      "claude_teams",
      () => true,
    );
    expect(api.ensureHerdrWorkspace).toHaveBeenLastCalledWith(
      "default",
      "demo",
      path,
    );
    expect(api.startHerdrAgent).toHaveBeenLastCalledWith(
      target,
      expect.objectContaining({
        kind: "claude",
        teams: true,
        direction: "tab",
        tab_label: "Claude Agent Teams",
        name: expect.stringMatching(/^hub-claude-teams-/),
      }),
      expect.any(Function),
    );
    expect(started?.path).toBe(path);
    expect(started?.target.pane_id).toBe("w1:p2");
    expect(started?.warning).toBe("Startup needs attention");
    expect(started).not.toHaveProperty("title");
    expect(api.openHerdrWorkspace).toHaveBeenLastCalledWith(
      "default",
      "w1",
      "w1:p2",
    );
    vi.mocked(api.startHerdrAgent).mockRejectedValueOnce(
      new Error("Tab creation failed"),
    );
    await expect(
      openProjectHerdrAgent("demo", path, "claude_teams", () => true),
    ).rejects.toThrow("Tab creation failed");
  },
);

it("shows the created tab before Agent readiness completes and preserves the later warning", async () => {
  vi.mocked(api.openHerdrWorkspace).mockClear();
  const target = {
    session: "default",
    workspace_id: "w1",
    pane_id: "w1:p1",
    terminal_id: "one",
    revision: 1,
    agent_session: null,
  };
  const opened = { project_id: "demo", path: "/projects/demo", target };
  const next = { ...target, pane_id: "w1:p2", terminal_id: "two" };
  vi.mocked(api.ensureHerdrWorkspace).mockResolvedValue(opened);
  let finish!: (value: {
    target: typeof target;
    warning: string | null;
  }) => void;
  vi.mocked(api.startHerdrAgent).mockImplementationOnce(
    (_target, _input, created) => {
      created?.(next);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  const created = vi.fn();
  const pending = openProjectHerdrAgent(
    "demo",
    opened.path,
    "codex",
    () => true,
    created,
  );
  await vi.waitFor(() =>
    expect(created).toHaveBeenCalledWith({
      ...opened,
      target: next,
      warning: "",
    }),
  );
  finish({ target: next, warning: "Inspect login" });
  expect((await pending)?.warning).toBe("Inspect login");
  expect(api.openHerdrWorkspace).not.toHaveBeenCalled();
});
