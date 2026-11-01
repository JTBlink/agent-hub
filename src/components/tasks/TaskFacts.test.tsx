// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  makeRepositoryTask,
  makeTaskMetadata,
  makeReviewMetadata,
  makeTaskDevelopment,
} from "../../../tests/fixtures/repositoryTask";
import { TaskFacts } from "./TaskFacts";
import { TaskDevelopmentView } from "./TaskDevelopmentView";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("shows developer metadata, failed CI, review feedback and links without inventing a conflict result", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const task = makeRepositoryTask({
    metadata: makeTaskMetadata({
      author: "author",
      labels: ["bug", "priority::high"],
      milestone: "v2",
      review: makeReviewMetadata({
        source_branch: "fix/parser",
        target_branch: "main",
        head_sha: "abcdef1234567890",
        merge_status: "checking",
        has_conflicts: null,
        reviewers: ["reviewer"],
      }),
    }),
  });
  const development = makeTaskDevelopment({
    checks: [
      {
        name: "Unit tests",
        status: "failure",
        url: "https://git.example.invalid/checks/1",
        sha: "abcdef1234567890",
      },
    ],
    related: [
      {
        title: "Parser issue",
        kind: "closes",
        number: 3,
        url: "https://git.example.invalid/team/demo/-/issues/3",
      },
    ],
    reviews: [
      {
        author: "reviewer",
        state: "CHANGES_REQUESTED",
        body: "Handle the empty input.",
        url: "",
        submitted_at: null,
        path: "src/parser.rs",
        line: 12,
        resolved: false,
      },
    ],
    warnings: ["related"],
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  const open = vi.fn();
  await act(async () =>
    root.render(
      <>
        <TaskFacts task={task} development={development} />
        <TaskDevelopmentView
          detail={{
            summary: task,
            body: "",
            comments: [],
            has_more_comments: false,
            development,
          }}
          components={{}}
          onOpen={open}
        />
      </>,
    ),
  );
  for (const value of [
    "priority::high",
    "fix/parser",
    "main",
    "author",
    "reviewer",
    "tasks.facts.unknown",
    "Unit tests",
    "tasks.values.failure",
    "Handle the empty input.",
    "src/parser.rs:12",
  ])
    expect(host.textContent).toContain(value);
  expect(host.textContent).not.toContain("tasks.facts.noConflicts");
  expect(host.textContent).toContain("tasks.facts.partial");
  const link = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Parser issue"),
  )!;
  await act(async () => link.click());
  expect(open).toHaveBeenCalledWith(
    "https://git.example.invalid/team/demo/-/issues/3",
  );
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
