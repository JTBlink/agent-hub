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
