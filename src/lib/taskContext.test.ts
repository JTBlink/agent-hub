import { expect, it } from "vitest";
import { taskContext } from "./taskContext";
import {
  makeRepositoryTask,
  makeTaskMetadata,
  makeReviewMetadata,
  makeTaskDevelopment,
} from "../../tests/fixtures/repositoryTask";

it("copies a developer-ready MR context with the correct identifier, branches, checks and review feedback", () => {
  const task = makeRepositoryTask({
    metadata: makeTaskMetadata({
      labels: ["bug"],
      review: makeReviewMetadata({
        source_branch: "fix/parser",
        target_branch: "main",
        head_sha: "abcdef",
        merge_status: "blocked",
      }),
    }),
  });
  const development = makeTaskDevelopment({
    checks: [
      {
        name: "tests",
        status: "failed",
        url: "https://git.example.invalid/checks/1",
        sha: "abcdef",
      },
    ],
    reviews: [
      {
        author: "reviewer",
        state: "CHANGES_REQUESTED",
        body: "Handle empty input",
        url: "",
        submitted_at: null,
        path: "src/parser.rs",
        line: 12,
        resolved: false,
      },
    ],
  });
  const context = taskContext(task, "Acceptance criteria", development);
  for (const value of [
    "MR !7",
    "fix/parser -> main",
    "Head: abcdef",
    "tests = failed",
    "src/parser.rs:12",
    "Handle empty input",
    "Acceptance criteria",
  ])
    expect(context.text).toContain(value);
});
