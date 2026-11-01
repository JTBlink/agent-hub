// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { Git } from "./Git";
import {
  commitProjectGit,
  setProjectGitStaged,
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
  commitProjectGit: vi.fn(),
  setProjectGitStaged: vi.fn(),
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
    .mockResolvedValue("@@ -0,0 +1 @@\n+new diff\n");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Git />));
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
  await act(async () => root.render(<Git />));
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
  await act(async () => root.render(<Git />));
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
    host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="tasks.project"]',
    )!.disabled,
  ).toBe(true);
  await act(async () => finish());
  expect(
    host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="tasks.project"]',
    )!.disabled,
  ).toBe(false);
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
        <Git />
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
          <Git />
        </SidebarVisibilityContext.Provider>,
      ),
    );
    expect(host.querySelector(".git-sidebar")).toBeNull();
    expect(statusContainer.textContent).toContain("main");
    expect(statusContainer.textContent).toContain("git.localRefs");
    expect(host.textContent).not.toContain("git.localRefs");
    expect(
      sidebarContainer.querySelector('[aria-label="tasks.project"]'),
    ).not.toBeNull();
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
