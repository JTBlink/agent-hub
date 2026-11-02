import { expect, it } from "vitest";
import { herdrFocusedPane } from "./herdrFocusedPane";
import type { HerdrPane, HerdrSnapshot, HerdrTarget } from "./herdrControlApi";
const target: HerdrTarget = {
  session: "default",
  workspace_id: "space",
  pane_id: "pane",
  terminal_id: "terminal",
  revision: 1,
  agent_session: null,
};
const pane: HerdrPane = {
  ...target,
  tab_id: "tab",
  cwd: null,
  focused: false,
  agent_status: "unknown",
  agent: null,
  name: null,
};
const snapshot = (...panes: HerdrPane[]): HerdrSnapshot => ({
  version: "1",
  workspaces: [
    {
      workspace_id: "space",
      active_tab_id: "tab",
      label: "Demo",
      directory: null,
      branch: null,
    },
  ],
  tabs: [],
  agents: [],
  panes,
});
it("resolves the sole live attached pane when global focus is absent", () => {
  expect(
    herdrFocusedPane(
      snapshot(pane, { ...pane, workspace_id: "other", focused: true }),
      target,
    ),
  ).toEqual(pane);
});
it("uses the uniquely focused pane in the active workspace tab", () => {
  const selected = {
    ...pane,
    pane_id: "selected",
    terminal_id: "selected-terminal",
    focused: true,
    revision: 9,
  };
  expect(herdrFocusedPane(snapshot(pane, selected), target)).toBe(selected);
});
it("rejects ambiguous, replaced, inactive and missing targets", () => {
  for (const data of [
    snapshot(pane, { ...pane, pane_id: "other" }),
    snapshot(
      { ...pane, focused: true },
      { ...pane, pane_id: "other", focused: true },
    ),
    snapshot({ ...pane, terminal_id: "replacement" }),
    snapshot({ ...pane, tab_id: "inactive" }),
    snapshot({ ...pane, workspace_id: "other" }),
    { ...snapshot(pane), workspaces: [] },
  ])
    expect(herdrFocusedPane(data, target)).toBeUndefined();
});

it("follows focus across spaces and back without reusing the original attachment", () => {
  const other = {
    ...pane,
    workspace_id: "second",
    pane_id: "second-pane",
    terminal_id: "second-terminal",
    tab_id: "second-tab",
    focused: true,
    revision: 9,
  };
  const data = snapshot(pane, other);
  data.workspaces.push({
    ...data.workspaces[0],
    workspace_id: "second",
    active_tab_id: "second-tab",
  });
  expect(herdrFocusedPane(data, target)).toBe(other);
  data.panes = [
    { ...pane, focused: true },
    { ...other, focused: false },
  ];
  expect(herdrFocusedPane(data, target)?.pane_id).toBe(pane.pane_id);
  data.panes = [{ ...pane, focused: true }, other];
  expect(herdrFocusedPane(data, target)).toBeUndefined();
});
