// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  readTaskViewPreferences,
  saveTaskViewPreferences,
} from "./taskViewPreferences";

afterEach(() => localStorage.clear());

it("restores legacy single-project selections and treats all as a live scope", () => {
  for (const [projectId, expected] of [
    ["demo", ["demo"]],
    ["all", []],
  ] as const) {
    localStorage.setItem(
      "agent-hub.taskView",
      JSON.stringify({ projectId, filters: {} }),
    );
    expect(readTaskViewPreferences().projectIds).toEqual(expected);
  }
});

it("validates and deduplicates multiple project IDs before restoring", () => {
  localStorage.setItem(
    "agent-hub.taskView",
    JSON.stringify({
      projectIds: ["first", 42, "first", "", "all", "second"],
      projectId: "legacy",
      filters: {},
    }),
  );
  expect(readTaskViewPreferences().projectIds).toEqual(["first", "second"]);
});

it("round-trips multiple projects and the all-project scope", () => {
  for (const projectIds of [["first", "second"], []]) {
    saveTaskViewPreferences({ ...readTaskViewPreferences(), projectIds });
    expect(readTaskViewPreferences().projectIds).toEqual(projectIds);
  }
});
