// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { makeProject } from "../../tests/fixtures/workspace";
import { createTerminalTab, writeTerminalLayout } from "./terminalLayout";
import { lastWorkspace } from "./lastWorkspace";
beforeEach(() => localStorage.clear());
it("restores the terminal's last checkout before falling back to project visit times", () => {
  const project = { ...makeProject(), id: "saved", visited_at: 10 };
  const newer = { ...makeProject(), id: "newer", visited_at: 100 };
  const tab = createTerminalTab(project.id, undefined, "~/projects/topic");
  writeTerminalLayout({ tabs: [tab], lastActiveId: tab.id, activeIds: {} });
  expect(lastWorkspace([project, newer])).toEqual({
    project,
    path: "~/projects/topic",
  });
  expect(lastWorkspace([newer])).toEqual({ project: newer, path: newer.path });
});
it("handles absent or corrupt layout and empty projects", () => {
  const older = { ...makeProject(), id: "older", visited_at: null };
  const recent = { ...makeProject(), id: "recent", visited_at: 100 };
  expect(lastWorkspace([older, recent])).toEqual({
    project: recent,
    path: recent.path,
  });
  expect(lastWorkspace([])).toBeNull();
});
