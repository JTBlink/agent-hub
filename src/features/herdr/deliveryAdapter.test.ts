import { expect, it } from "vitest";
import { currentWorkspaceAgent } from "./deliveryAdapter";
import type { HerdrPane, HerdrSnapshot } from "./lib/herdrControlApi";
const pane: HerdrPane = {
  pane_id: "agent",
  terminal_id: "terminal",
  workspace_id: "site",
  tab_id: "tab",
  cwd: "/workspace/site",
  focused: false,
  revision: 1,
  agent_status: "idle",
  agent: "codex",
  name: "Codex",
  agent_session: null,
};
const snapshot = (...agents: HerdrPane[]): HerdrSnapshot => ({
  version: "1",
  workspaces: [
    {
      workspace_id: "site",
      label: "Site",
      active_tab_id: "tab",
      directory: "/workspace/site",
      branch: null,
    },
  ],
  tabs: [],
  panes: agents,
  agents,
});
it("uses the sole Agent in the current checkout without following another workspace", () => {
  const other = {
    ...pane,
    pane_id: "other",
    cwd: "/workspace/other",
    focused: true,
  };
  expect(
    currentWorkspaceAgent(snapshot(pane, other), "/workspace/site"),
  ).toEqual(pane);
  expect(
    currentWorkspaceAgent(snapshot(other), "/workspace/site"),
  ).toBeUndefined();
});
it("uses current focus and rejects ambiguous Agents in the same workspace", () => {
  const second = { ...pane, pane_id: "second", terminal_id: "second-terminal" };
  expect(
    currentWorkspaceAgent(snapshot(pane, second), "/workspace/site"),
  ).toBeUndefined();
  expect(
    currentWorkspaceAgent(
      snapshot(pane, { ...second, focused: true }),
      "/workspace/site",
    )?.pane_id,
  ).toBe("second");
  expect(
    currentWorkspaceAgent(
      snapshot({ ...pane, focused: true }, { ...second, focused: true }),
      "/workspace/site",
    ),
  ).toBeUndefined();
});
it("ignores inactive tabs, shells and Agents in a different checkout", () => {
  for (const agent of [
    { ...pane, tab_id: "inactive" },
    { ...pane, agent: null },
    { ...pane, cwd: "/workspace/other" },
  ])
    expect(
      currentWorkspaceAgent(snapshot(agent), "/workspace/site"),
    ).toBeUndefined();
});
