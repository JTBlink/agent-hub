// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  createTerminalTab,
  readTerminalLayout,
  writeTerminalLayout,
  terminalScopeKey,
  TERMINAL_LAYOUT_KEY,
  TERMINAL_PANE_LIMIT,
} from "./terminalLayout";

beforeEach(() => localStorage.clear());

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
  const activeIds = {
    [terminalScopeKey(tab.projectId, tab.worktreePath)]: tab.id,
  };
  writeTerminalLayout({ tabs: [tab], activeIds, lastActiveId: tab.id });
  expect(localStorage.getItem(TERMINAL_LAYOUT_KEY)).not.toContain(
    "private prompt",
  );
  expect(localStorage.getItem(TERMINAL_LAYOUT_KEY)).not.toContain("context");
  const layout = { ...tab };
  delete layout.context;
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
