// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Git } from "./Git";
import {
  getProjectGitStatus,
  runProjectGitAction,
  type GitStatus,
} from "../lib/gitApi";
import { makeProject } from "../../tests/fixtures/workspace";

const workspace = vi.hoisted(() => ({ path: "<workspace>/demo" }));
const project = makeProject();
const translate = (key: string) => key;
vi.mock("../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("../context/AppContext", () => ({ useApp: () => ({ projects: [] }) }));
vi.mock("../hooks/useActiveWorkspace", () => ({
  useActiveWorkspace: () => ({ project, path: workspace.path }),
}));
vi.mock("../components/git/GitHistory", () => ({ GitHistory: () => null }));
vi.mock("../components/git/GitGraph", () => ({ GitGraph: () => null }));
vi.mock("../lib/gitApi", () => ({
  getProjectGitStatus: vi.fn(),
  runProjectGitAction: vi.fn(),
  getProjectGitDiff: vi.fn(),
  getProjectGitCommitDiff: vi.fn(),
  commitProjectGit: vi.fn(),
  setProjectGitStaged: vi.fn(),
  discardProjectGitChanges: vi.fn(),
  getProjectGitReferences: vi.fn(),
}));
let host: HTMLDivElement;
let root: Root;
let status: GitStatus;
beforeEach(() => {
  vi.clearAllMocks();
  workspace.path = "<workspace>/demo";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  status = {
    branch: "main",
    head: "abc",
    upstream: "origin/main",
    ahead: 5,
    behind: 0,
    files: [],
    commits: [],
    state: "Clean",
    truncated: false,
  };
  vi.mocked(getProjectGitStatus).mockImplementation(async () => status);
  vi.mocked(runProjectGitAction).mockReset().mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Git />
      </MemoryRouter>,
    ),
  );
}
const syncButton = () =>
  host.querySelector<HTMLButtonElement>('[aria-label^="git.syncChanges"]');
it("shows the pending push count on a clean checkout and syncs pull before push without a commit message", async () => {
  vi.mocked(runProjectGitAction).mockImplementation(
    async (_project, _path, action) => {
      if (action === "push") status = { ...status, ahead: 0, behind: 0 };
    },
  );
  await render();
  expect(syncButton()).not.toBeNull();
  expect(syncButton()!.textContent).toContain("5↑");
  expect(syncButton()!.disabled).toBe(false);
  await act(async () => syncButton()!.click());
  expect(vi.mocked(runProjectGitAction).mock.calls).toEqual([
    [project.id, "<workspace>/demo", "pull"],
    [project.id, "<workspace>/demo", "push"],
  ]);
  expect(syncButton()).toBeNull();
});
it("blocks duplicate syncs and never pushes after a pull failure", async () => {
  let fail: (reason: Error) => void = () => {};
  vi.mocked(runProjectGitAction).mockReturnValueOnce(
    new Promise((_, reject) => {
      fail = reject;
    }),
  );
  await render();
  expect(syncButton()).not.toBeNull();
  await act(async () => syncButton()!.click());
  expect(syncButton()!.disabled).toBe(true);
  await act(async () => syncButton()!.click());
  expect(runProjectGitAction).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error("Fast-forward required")));
  expect(runProjectGitAction).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Fast-forward required",
  );
  expect(
    host
      .querySelector<HTMLAnchorElement>('[role="alert"] a')
      ?.getAttribute("href"),
  ).toBe("/settings#logs");
  expect(syncButton()!.disabled).toBe(false);
});
it.each(["up_to_date", "no_upstream", "dirty"])(
  "keeps the commit action for %s instead of offering sync",
  async (mode) => {
    if (mode === "up_to_date") status.ahead = 0;
    if (mode === "no_upstream") status.upstream = null;
    if (mode === "dirty")
      status.files = [
        {
          path: "demo.txt",
          staged: true,
          unstaged: false,
          conflicted: false,
          status: "modified",
        },
      ];
    await render();
    expect(syncButton()).toBeNull();
    expect(
      host.querySelector('button[title="git.commitStagedHint"]'),
    ).not.toBeNull();
  },
);

it("shows incoming and outgoing counts when the cached branch has diverged", async () => {
  status.behind = 2;
  await render();
  expect(syncButton()?.textContent).toContain("2↓ 5↑");
});

it("does not push the previous checkout when the user switches worktrees during pull", async () => {
  let finish: () => void = () => {};
  vi.mocked(runProjectGitAction).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await act(async () => syncButton()!.click());
  workspace.path = "<workspace>/other";
  await render();
  await act(async () => finish());
  expect(runProjectGitAction).toHaveBeenCalledExactlyOnceWith(
    project.id,
    "<workspace>/demo",
    "pull",
  );
});
