import { expect, it } from "vitest";
import { makeRepositoryTask } from "../../tests/fixtures/repositoryTask";
import { reviewActions } from "./taskReviewActions";

it("limits review operations to the selected object kind and current state", () => {
  expect(reviewActions(makeRepositoryTask({ kind: "issue" }))).toEqual([]);
  expect(reviewActions(makeRepositoryTask())).toEqual([
    "review",
    "repair",
    "ci",
    "merge",
  ]);
  expect(reviewActions(makeRepositoryTask({ state: "merged" }))).toEqual([
    "review",
    "ci",
  ]);
});
