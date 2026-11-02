// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorktreeExplorer } from "./WorktreeExplorer";
import { getWorktreeFiles } from "../../lib/worktreeApi";
import type { GitFile } from "../../lib/gitApi";

vi.mock("../../lib/worktreeApi", () => ({ getWorktreeFiles: vi.fn() }));
const t = (key: string, options?: { count: number }) =>
  options ? `${key}: ${options.count}` : key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(getWorktreeFiles).mockImplementation(async (_id, _root, path) =>
    path === "src"
      ? [
          {
            name: "new.ts",
            path: "src/new.ts",
            is_dir: false,
            is_symlink: false,
          },
        ]
      : [{ name: "src", path: "src", is_dir: true, is_symlink: false }],
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows collapsed folder changes, opens files and clears decorations without collapsing", async () => {
  const select = vi.fn();
  const files: GitFile[] = [
    {
      path: "src/new.ts",
      status: "added",
      staged: false,
      unstaged: true,
      conflicted: false,
    },
  ];
  const render = (gitFiles: GitFile[]) =>
    root.render(
      <WorktreeExplorer
        projectId="demo"
        worktreePath="<workspace>/demo"
        selected="src/new.ts"
        onSelect={select}
        gitFiles={gitFiles}
      />,
    );
  await act(async () => render(files));
  expect(
    host.querySelector('[aria-label="git.changedFiles: 1"]'),
  ).not.toBeNull();
  expect(host.querySelector('[title="src/new.ts"]')).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[title="src"]')!.click(),
  );
  expect(
    host.querySelector('[aria-label="git.states.untracked"]')?.textContent,
  ).toBe("U");
  const button = host.querySelector<HTMLButtonElement>('[title="src/new.ts"]')!;
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await act(async () => button.click());
  expect(select).toHaveBeenCalledWith("src/new.ts");
  await act(async () => render([]));
  expect(host.querySelector('[aria-label="git.states.untracked"]')).toBeNull();
  expect(host.querySelector('[aria-label="git.changedFiles: 1"]')).toBeNull();
  expect(host.querySelector('[title="src/new.ts"]')).not.toBeNull();
});

it("requests Git status refresh alongside the file listing", async () => {
  const refresh = vi.fn();
  window.addEventListener("project-git-changed", refresh);
  try {
    await act(async () =>
      root.render(
        <WorktreeExplorer
          projectId="demo"
          worktreePath="<workspace>/demo"
          onSelect={vi.fn()}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="worktree.refreshFiles"]',
        )!
        .click(),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(getWorktreeFiles).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener("project-git-changed", refresh);
  }
});
