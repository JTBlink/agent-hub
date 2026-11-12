import { expect, it } from "vitest";
import type { AutomationTask } from "./tauri";
import {
  applyAutomationOrder,
  moveAutomationTask,
  parseAutomationOrder,
} from "./automationOrder";

const tasks = ["a", "b", "c", "d"].map((id) => ({ id }) as AutomationTask);
const ids = (list: AutomationTask[]) => list.map((task) => task.id);

it("places persisted tasks first and appends new tasks in provider order", () => {
  expect(ids(applyAutomationOrder(tasks, ["c", "removed", "a"]))).toEqual([
    "c",
    "a",
    "b",
    "d",
  ]);
});

it("moves a task to the drop target within the full list", () => {
  expect(moveAutomationTask(tasks, ["d"], "c", "d")).toEqual([
    "c",
    "d",
    "a",
    "b",
  ]);
  expect(moveAutomationTask(tasks, [], "a", "c")).toEqual(["b", "c", "a", "d"]);
});

it("ignores malformed persisted orders", () => {
  expect(parseAutomationOrder("not-json")).toEqual([]);
  expect(parseAutomationOrder(JSON.stringify(["a", 2]))).toEqual(["a"]);
});
