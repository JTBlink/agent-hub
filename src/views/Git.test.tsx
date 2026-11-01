// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { Git } from "./Git";
import { WorkspaceFilesProvider } from "../components/worktree/WorkspaceFilesContext";
import {
  useWorkspaceFiles,
  WorkspaceFilesContext,
} from "../hooks/useWorkspaceFiles";
import {
  commitProjectGit,
  setProjectGitStaged,
  getProjectGitDiff,
  getProjectGitCommit,
  getProjectGitCommitDiff,
  getProjectGitStatus,
  getProjectGitGraph,
  type GitStatus,
} from "../lib/gitApi";
import { makeProject } from "../../tests/fixtures/workspace";
import { installCodeEditorGeometry } from "../test/codeEditor";

function WorkspaceControl() {
  const { setCheckout } = useWorkspaceFiles();
  return (
    <button
      data-select-workspace
      onClick={() =>
        setCheckout({ projectId: "second", worktreePath: "<workspace>/demo" })
      }
    >
      Switch workspace
    </button>
  );
}
function TestGit() {
  return (
    <WorkspaceFilesProvider>
      <WorkspaceControl />
      <Git />
    </WorkspaceFilesProvider>
  );
}

const translate = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n: { language: "en" } }),
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
  commitProjectGit: vi.fn(),
  setProjectGitStaged: vi.fn(),
  getProjectGitStatus: vi.fn(),
  getProjectGitGraph: vi.fn(),
  getProjectGitDiff: vi.fn(),
  getProjectGitCommit: vi.fn(),
  getProjectGitCommitDiff: vi.fn(),
}));

it("follows the shared checkout on entry and when the workspace changes without overwriting it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitStatus).mockClear();
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "topic",
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    state: "Clean",
    files: [],
    commits: [],
    truncated: false,
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  const setCheckout = vi.fn();
  const render = (path: string) => (
    <WorkspaceFilesContext.Provider
      value={{
        files: {},
        setFiles: vi.fn(),
        checkout: { projectId: "second", worktreePath: path },
        setCheckout,
      }}
    >
      <Git />
    </WorkspaceFilesContext.Provider>
  );
  try {
    await act(async () => root.render(render("<workspace>/topic")));
    expect(getProjectGitStatus).toHaveBeenCalledTimes(1);
    expect(getProjectGitStatus).toHaveBeenLastCalledWith(
      "second",
      "<workspace>/topic",
    );
    expect(host.querySelector('[aria-label="tasks.project"]')).toBeNull();
    expect(host.querySelector('[aria-label="git.worktree"]')).toBeNull();
    await act(async () => root.render(render("<workspace>/other")));
    expect(getProjectGitStatus).toHaveBeenLastCalledWith(
      "second",
      "<workspace>/other",
    );
    expect(setCheckout).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

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
    .mockResolvedValue("@@ -0,0 +1 @@\n+new diff\n");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<TestGit />));
  expect(host.textContent).toContain("feature/parser");
  const change = (staged: boolean) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) =>
        button.getAttribute("aria-label") ===
        `${staged ? "git.staged" : "git.unstaged"}: src/parser.rs`,
    )!;
  await act(async () => change(true).click());
  expect(getProjectGitDiff).toHaveBeenLastCalledWith(
    "first",
    "<workspace>/demo",
    "src/parser.rs",
    true,
  );
  expect(
    host.querySelector('[role="combobox"][aria-label="tasks.project"]'),
  ).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>("[data-select-workspace]")!.click(),
  );
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

it("stages the selected file and keeps the message when a commit fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "main",
    head: "abcdef",
    upstream: null,
    ahead: null,
    behind: null,
    state: "Clean",
    truncated: false,
    commits: [],
    files: [
      {
        path: "src/demo.ts",
        staged: true,
        unstaged: true,
        conflicted: false,
        status: "modified",
      },
    ],
  });
  vi.mocked(setProjectGitStaged).mockResolvedValue();
  vi.mocked(commitProjectGit)
    .mockRejectedValueOnce(new Error("Hook rejected commit"))
    .mockResolvedValue();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<TestGit />));
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="git.stageFile: src/demo.ts"]',
      )!
      .click(),
  );
  expect(setProjectGitStaged).toHaveBeenLastCalledWith(
    "first",
    "<workspace>/demo",
    ["src/demo.ts"],
    true,
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="git.unstageFile: src/demo.ts"]',
      )!
      .click(),
  );
  expect(setProjectGitStaged).toHaveBeenLastCalledWith(
    "first",
    "<workspace>/demo",
    ["src/demo.ts"],
    false,
  );
  const input = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "Improve parser");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[type="submit"]')!.click(),
  );
  expect(commitProjectGit).toHaveBeenLastCalledWith(
    "first",
    "<workspace>/demo",
    "Improve parser",
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Hook rejected commit",
  );
  expect(input.value).toBe("Improve parser");
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[type="submit"]')!.click(),
  );
  expect(input.value).toBe("");
  const group = [
    ...host.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
  ].find((button) => button.textContent?.includes("git.stagedChanges"))!;
  await act(async () => group.click());
  expect(group.getAttribute("aria-expanded")).toBe("false");
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("blocks duplicate staging and commits without staged changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "main",
    head: null,
    upstream: null,
    ahead: null,
    behind: null,
    state: "Clean",
    truncated: false,
    commits: [],
    files: [
      {
        path: "demo.ts",
        staged: false,
        unstaged: true,
        conflicted: false,
        status: "added",
      },
    ],
  });
  vi.mocked(setProjectGitStaged).mockClear();
  vi.mocked(commitProjectGit).mockClear();
  let finish!: () => void;
  vi.mocked(setProjectGitStaged).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<TestGit />));
  expect(
    host.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled,
  ).toBe(true);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(commitProjectGit).not.toHaveBeenCalled();
  const stage = host.querySelector<HTMLButtonElement>(
    '[aria-label="git.stageAll"]',
  )!;
  await act(async () => {
    stage.click();
    stage.click();
  });
  expect(setProjectGitStaged).toHaveBeenCalledTimes(1);
  expect(
    host.querySelector('[role="combobox"][aria-label="tasks.project"]'),
  ).toBeNull();
  await act(async () => finish());
  expect(
    host.querySelector('[role="combobox"][aria-label="git.worktree"]'),
  ).toBeNull();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("hides its change sidebar when the shared shell displays another sidebar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "main",
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    state: "Clean",
    truncated: false,
    files: [],
    commits: [],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (visible: boolean) =>
    root.render(
      <SidebarVisibilityContext.Provider
        value={{
          resourcePanelVisible: visible,
          setResourcePanelVisible: () => {},
        }}
      >
        <TestGit />
      </SidebarVisibilityContext.Provider>,
    );
  try {
    await act(async () => render(false));
    const sidebar = host.querySelector(".git-sidebar")!;
    expect(sidebar.hasAttribute("hidden")).toBe(false);
    await act(async () => render(true));
    expect(sidebar.hasAttribute("hidden")).toBe(true);
    await act(async () => render(false));
    expect(sidebar.hasAttribute("hidden")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("renders source control in the shell sidebar while keeping diffs in the editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "main",
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    state: "Clean",
    truncated: false,
    commits: [],
    files: [
      {
        path: "README.md",
        staged: false,
        unstaged: true,
        conflicted: false,
        status: "modified",
      },
    ],
  });
  vi.mocked(getProjectGitDiff).mockResolvedValue("@@ -0,0 +1 @@\n+hello\n");
  const host = document.createElement("div");
  const sidebarContainer = document.createElement("div");
  const statusContainer = document.createElement("div");
  document.body.append(sidebarContainer, statusContainer, host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <SidebarVisibilityContext.Provider
          value={{
            resourcePanelVisible: false,
            setResourcePanelVisible: () => {},
            sidebarContainer,
            statusContainer,
          }}
        >
          <TestGit />
        </SidebarVisibilityContext.Provider>,
      ),
    );
    expect(host.querySelector(".git-sidebar")).toBeNull();
    expect(statusContainer.textContent).toContain("main");
    expect(statusContainer.textContent).toContain("git.localRefs");
    expect(host.textContent).not.toContain("git.localRefs");
    expect(
      sidebarContainer.querySelector('[aria-label="tasks.project"]'),
    ).toBeNull();
    expect(sidebarContainer.querySelector("form")).not.toBeNull();
    await act(async () =>
      sidebarContainer
        .querySelector<HTMLButtonElement>(
          '[aria-label="git.unstaged: README.md"]',
        )!
        .click(),
    );
    expect(host.textContent).toContain("README.md");
    expect(getProjectGitDiff).toHaveBeenLastCalledWith(
      "first",
      "<workspace>/demo",
      "README.md",
      false,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    sidebarContainer.remove();
    statusContainer.remove();
    vi.unstubAllGlobals();
  }
});

it("opens committed file diffs separately from working changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  const sha = "a".repeat(40);
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "main",
    head: sha,
    upstream: null,
    ahead: null,
    behind: null,
    state: "Clean",
    truncated: false,
    files: [],
    commits: [
      { sha, summary: "Historical update", author: "example", time: 1000 },
    ],
  });
  vi.mocked(getProjectGitCommit).mockResolvedValue({
    sha,
    message: "Historical update",
    author: "example",
    committer: "example",
    time: 1000,
    parents: [],
    additions: 1,
    deletions: 0,
    truncated: false,
    files: [{ path: "src/demo.ts", old_path: null, status: "added" }],
  });
  vi.mocked(getProjectGitCommitDiff).mockResolvedValue(
    "@@ -0,0 +1 @@\n+historical content\n",
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TestGit />));
    await act(async () => {
      const details = host.querySelector<HTMLDetailsElement>(
        ".git-history-commit",
      )!;
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="git.commitFile: src/demo.ts"]',
        )!
        .click(),
    );
    expect(getProjectGitCommitDiff).toHaveBeenLastCalledWith(
      "first",
      "<workspace>/demo",
      sha,
      "src/demo.ts",
    );
    expect(host.textContent).toContain("historical content");
    expect(host.textContent).toContain("git.parentVersion");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(host.textContent).toContain("src/demo.ts");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("opens Git Graph from source control and returns to the selected diff on close", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitStatus).mockResolvedValue({
    branch: "main",
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    state: "Clean",
    truncated: false,
    commits: [],
    files: [
      {
        path: "README.md",
        staged: false,
        unstaged: true,
        conflicted: false,
        status: "modified",
      },
    ],
  });
  vi.mocked(getProjectGitDiff).mockResolvedValue("@@ -0,0 +1 @@\n+hello\n");
  vi.mocked(getProjectGitGraph).mockResolvedValue({
    commits: [
      {
        sha: "a".repeat(40),
        summary: "Example graph commit",
        author: "Example",
        time: 1793408400,
        parents: [],
        refs: [{ name: "main", remote: false }],
      },
    ],
    has_more: false,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TestGit />));
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="git.unstaged: README.md"]',
        )!
        .click(),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="git.graph.open"]')!
        .click(),
    );
    expect(
      host
        .querySelector('[aria-label="git.graph.open"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(host.querySelector("table")?.textContent).toContain(
      "Example graph commit",
    );
    expect(getProjectGitGraph).toHaveBeenLastCalledWith(
      "first",
      "<workspace>/demo",
      true,
      200,
    );
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(getProjectGitGraph).toHaveBeenLastCalledWith(
      "first",
      "<workspace>/demo",
      false,
      200,
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="git.graph.close"]')!
        .click(),
    );
    expect(host.querySelector("table")).toBeNull();
    expect(host.querySelector(".cm-editor")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
