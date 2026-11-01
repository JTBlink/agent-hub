// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Git } from "./Git";
import {
  getProjectGitDiff,
  getProjectGitStatus,
  type GitStatus,
} from "../lib/gitApi";
import { makeProject } from "../../tests/fixtures/workspace";
import { installCodeEditorGeometry } from "../test/codeEditor";
const translate = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));
vi.mock("../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    projects: [
      { ...makeProject(), id: "first", name: "First" },
      { ...makeProject(), id: "second", name: "Second" },
    ],
  }),
}));
vi.mock("../hooks/useProjectWorktrees", () => ({
  useProjectWorktrees: () => ({ worktrees: [] }),
}));
vi.mock("../lib/gitApi", () => ({
  getProjectGitStatus: vi.fn(),
  getProjectGitDiff: vi.fn(),
}));

it("keeps staged and unstaged diffs separate and ignores an older project's result", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  const status: GitStatus = {
    branch: "feature/parser",
    head: "abcdef",
    upstream: "origin/main",
    ahead: 2,
    behind: 1,
    state: "Clean",
    truncated: false,
    commits: [
      { sha: "abcdef", summary: "Improve parser", author: "demo", time: 1000 },
    ],
    files: [
      {
        path: "src/parser.rs",
        staged: true,
        unstaged: true,
        conflicted: false,
        status: "modified",
      },
    ],
  };
  vi.mocked(getProjectGitStatus).mockResolvedValue(status);
  let finish!: (text: string) => void;
  vi.mocked(getProjectGitDiff)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue("+new diff\n");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Git />));
  expect(host.textContent).toContain("feature/parser");
  const change = (staged: boolean) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) =>
        button.textContent?.includes(staged ? "git.staged" : "git.unstaged") &&
        button.textContent.includes("src/parser.rs"),
    )!;
  await act(async () => change(true).click());
  expect(getProjectGitDiff).toHaveBeenLastCalledWith(
    "first",
    "<workspace>/demo",
    "src/parser.rs",
    true,
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[role="combobox"][aria-label="tasks.project"]',
      )!
      .click(),
  );
  const second = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((option) => option.textContent === "Second")!;
  await act(async () => second.click());
  await act(async () => change(false).click());
  expect(getProjectGitDiff).toHaveBeenLastCalledWith(
    "second",
    "<workspace>/demo",
    "src/parser.rs",
    false,
  );
  await act(async () => finish("+old diff\n"));
  expect(host.textContent).not.toContain("old diff");
  expect(host.textContent).toContain("new diff");
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
