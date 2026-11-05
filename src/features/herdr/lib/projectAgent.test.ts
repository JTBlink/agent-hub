import { expect, it, vi } from "vitest";
import * as api from "../api";
import { openProjectHerdrAgent } from "./projectAgent";
vi.mock("../api", () => ({
  ensureHerdrWorkspace: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  startHerdrAgent: vi.fn(),
}));
it("reuses an Agent only in the requested directory and starts the chosen kind through the common API", async () => {
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
    path: "/projects/demo",
    target,
  });
  const pane = {
    ...target,
    cwd: "/projects/demo",
    agent: "codex",
    agent_status: "working",
    name: "existing",
    focused: true,
    tab_id: "w1:t1",
  };
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "one",
    workspaces: [],
    tabs: [],
    panes: [pane],
    agents: [pane],
  });
  const existing = await openProjectHerdrAgent(
    "demo",
    "/projects/demo",
    "codex",
    () => true,
  );
  expect(existing?.target.pane_id).toBe("w1:p1");
  expect(api.startHerdrAgent).not.toHaveBeenCalled();
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "one",
    workspaces: [],
    tabs: [],
    panes: [],
    agents: [{ ...pane, cwd: "/projects/other" }],
  });
  vi.mocked(api.startHerdrAgent).mockResolvedValue({
    target: { ...target, pane_id: "w1:p2" },
    warning: "Startup needs attention",
  });
  const started = await openProjectHerdrAgent(
    "demo",
    "/projects/demo",
    "claude_teams",
    () => true,
  );
  expect(api.startHerdrAgent).toHaveBeenCalledWith(
    target,
    expect.objectContaining({
      kind: "claude",
      teams: true,
      name: expect.stringMatching(/^hub-claude-teams-/),
    }),
  );
  expect(started?.target.pane_id).toBe("w1:p2");
  expect(started?.warning).toBe("Startup needs attention");
});
