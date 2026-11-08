import { expect, it } from "vitest";
import { attachHerdrClient } from "./herdrClientTabs";
import { createTerminalTab } from "../../../lib/terminalLayout";

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
it("reuses a toolbar client across workspaces and removes a duplicate menu client without touching other sessions or shells", () => {
  const toolbar = createTerminalTab("demo", undefined, opened.path);
  toolbar.title = "My terminal";
  toolbar.paneAttachments = { [toolbar.activePane]: opened };
  const duplicate = createTerminalTab("demo", undefined, opened.path);
  duplicate.herdrTarget = opened.target;
  const shell = createTerminalTab("demo", undefined, opened.path);
  const other = createTerminalTab("demo", undefined, opened.path);
  other.herdrTarget = { ...opened.target, session: "review" };
  const next = {
    ...opened,
    target: { ...opened.target, workspace_id: "w2", pane_id: "w2:p2" },
  };
  const result = attachHerdrClient([toolbar, duplicate, shell, other], next);
  expect(result.tabId).toBe(toolbar.id);
  expect(result.tabs.map((tab) => tab.id)).toEqual([
    toolbar.id,
    shell.id,
    other.id,
  ]);
  expect(result.tabs[0].title).toBe("My terminal");
  expect(result.tabs[0].paneAttachments?.[toolbar.activePane]).toEqual(next);
  expect(result.tabs[1]).toBe(shell);
  expect(result.tabs[2]).toBe(other);
});
it("removes only a redundant Herdr pane from a split and retains its local shell", () => {
  const retained = { ...createTerminalTab("demo"), herdrTarget: opened.target };
  const split = createTerminalTab("demo");
  split.panes.push("client");
  split.paneAttachments = { client: opened };
  const result = attachHerdrClient([retained, split], opened);
  expect(result.tabs[1].panes).toEqual([split.activePane]);
  expect(result.tabs[1].paneAttachments).toEqual({});
});
it("converts the preferred shell only when the session has no client", () => {
  const shell = createTerminalTab("demo");
  const result = attachHerdrClient([shell], opened, {
    tab: shell,
    pane: shell.activePane,
  });
  expect(result.tabs).toHaveLength(1);
  expect(result.tabId).toBe(shell.id);
  expect(result.tabs[0].paneAttachments?.[shell.activePane]).toEqual(opened);
});
