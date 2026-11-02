// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  lastHerdrAttachment,
  createTerminalTab,
  readTerminalLayout,
  writeTerminalLayout,
  terminalScopeKey,
  TERMINAL_LAYOUT_KEY,
  TERMINAL_PANE_LIMIT,
} from "./terminalLayout";

beforeEach(() => localStorage.clear());

it("preserves custom tab names and independent pane attachments without persisting agent identity", () => {
  const tab = createTerminalTab("demo", undefined, "/projects/demo");
  tab.title = "  Review  ";
  tab.paneAttachments = {
    [tab.activePane]: {
      project_id: "other",
      path: "/projects/other",
      target: {
        session: "default",
        workspace_id: "w1",
        pane_id: "w1:p1",
        terminal_id: "term1",
        revision: 9,
        agent_session: { private: true },
      },
    },
  };
  writeTerminalLayout({ tabs: [tab], activeIds: {}, lastActiveId: tab.id });
  const restored = readTerminalLayout().tabs[0];
  expect(restored.title).toBe("Review");
  expect(restored.paneAttachments?.[tab.activePane]).toEqual({
    ...tab.paneAttachments[tab.activePane],
    target: {
      ...tab.paneAttachments[tab.activePane].target,
      revision: 0,
      agent_session: null,
    },
  });
  expect(localStorage.getItem(TERMINAL_LAYOUT_KEY)).not.toContain("private");
});

it("saves only terminal layout and restores split direction, focus and scoped selection", () => {
  const tab = createTerminalTab(
    "demo",
    {
      key: "task",
      title: "Task",
      text: "private prompt",
      url: "https://example.invalid/1",
    },
    "<workspace>/topic",
  );
  tab.panes.push("second-pane");
  tab.activePane = "second-pane";
  tab.direction = "vertical";
  tab.agent = "codex";
  const activeIds = {
    [terminalScopeKey(tab.projectId, tab.worktreePath)]: tab.id,
  };
  writeTerminalLayout({ tabs: [tab], activeIds, lastActiveId: tab.id });
  expect(localStorage.getItem(TERMINAL_LAYOUT_KEY)).not.toContain(
    "private prompt",
  );
  expect(localStorage.getItem(TERMINAL_LAYOUT_KEY)).not.toContain("context");
  expect(
    JSON.parse(localStorage.getItem(TERMINAL_LAYOUT_KEY)!).tabs[0].agent,
  ).toBeUndefined();
  const layout = { ...tab };
  delete layout.context;
  delete layout.agent;
  expect(readTerminalLayout()).toEqual({
    tabs: [layout],
    activeIds,
    lastActiveId: tab.id,
  });
});

it.each([
  "broken json",
  "null",
  '{"version":2,"tabs":[]}',
  '{"version":1,"tabs":{}}',
])("ignores unusable saved terminal state: %s", (value) => {
  localStorage.setItem(TERMINAL_LAYOUT_KEY, value);
  expect(readTerminalLayout().tabs).toEqual([]);
});

it("bounds restored panes and discards duplicate identifiers and foreign selections", () => {
  const tab = createTerminalTab("demo", undefined, "<workspace>/main");
  tab.panes = ["pane", "pane", "extra"];
  tab.activePane = "missing";
  const tabs = [
    tab,
    tab,
    ...Array.from({ length: 10 }, () => createTerminalTab("demo")),
  ];
  localStorage.setItem(
    TERMINAL_LAYOUT_KEY,
    JSON.stringify({
      version: 1,
      tabs,
      activeIds: {
        foreign: tab.id,
        [terminalScopeKey("other", tab.worktreePath)]: tab.id,
      },
      lastActiveId: "missing",
    }),
  );
  const restored = readTerminalLayout();
  expect(restored.tabs.reduce((sum, item) => sum + item.panes.length, 0)).toBe(
    TERMINAL_PANE_LIMIT,
  );
  expect(
    new Set(restored.tabs.flatMap((item) => [item.id, ...item.panes])).size,
  ).toBe(restored.tabs.length + TERMINAL_PANE_LIMIT);
  expect(restored.tabs[0].panes).toEqual(["pane", "extra"]);
  expect(restored.tabs[0].activePane).toBe("pane");
  expect(restored.activeIds).toEqual({});
});

it("restores a native Herdr attachment locator without retaining Agent identity", () => {
  const tab = createTerminalTab("demo", undefined, "/projects/demo");
  tab.herdrTarget = {
    session: "default",
    workspace_id: "w1",
    pane_id: "w1:p1",
    terminal_id: "native-1",
    revision: 10,
    agent_session: { private: "identity" },
  };
  writeTerminalLayout({ tabs: [tab], activeIds: {}, lastActiveId: tab.id });
  expect(readTerminalLayout().tabs[0].herdrTarget).toEqual({
    ...tab.herdrTarget,
    revision: 0,
    agent_session: null,
  });
  expect(lastHerdrAttachment(readTerminalLayout())).toMatchObject({
    project_id: "demo",
    path: "/projects/demo",
    target: { pane_id: "w1:p1" },
  });
  expect(localStorage.getItem(TERMINAL_LAYOUT_KEY)).not.toContain("private");
});
