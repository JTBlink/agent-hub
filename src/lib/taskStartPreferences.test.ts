// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  defaultTaskStartPreferences,
  readTaskStartPreferences,
  saveTaskStartPreferences,
} from "./taskStartPreferences";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("keeps reusable options scoped to a project and falls back from invalid storage", () => {
  saveTaskStartPreferences("demo", {
    ...defaultTaskStartPreferences,
    session: "runner",
    createNew: true,
    promptTemplate: "Review acceptance",
  });
  expect(readTaskStartPreferences("demo")).toMatchObject({
    session: "runner",
    createNew: true,
    promptTemplate: "Review acceptance",
  });
  expect(readTaskStartPreferences("other").createNew).toBe(false);
  localStorage.setItem(
    "agent-hub.taskStart:demo",
    '{"version":1,"createNew":"true","skills":[null,{},"bad"]}',
  );
  expect(readTaskStartPreferences("demo")).toEqual(defaultTaskStartPreferences);
  localStorage.setItem("agent-hub.taskStart:demo", "not json");
  expect(readTaskStartPreferences("demo")).toEqual(defaultTaskStartPreferences);
});

it("reports a storage failure without breaking the dialog", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  expect(saveTaskStartPreferences("demo", defaultTaskStartPreferences)).toBe(
    false,
  );
});
