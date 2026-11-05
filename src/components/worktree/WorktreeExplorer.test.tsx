// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorktreeExplorer } from "./WorktreeExplorer";
import { getWorktreeFiles } from "../../lib/worktreeApi";
import type { GitFile } from "../../lib/gitApi";

vi.mock("../../lib/worktreeApi", async (original) => ({
  ...(await original<typeof import("../../lib/worktreeApi")>()),
  getWorktreeFiles: vi.fn(),
}));
vi.mock("../../hooks/useWorktreeDocument", () => ({
  hasPendingWorktreeDocument: vi.fn(),
}));
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
      <MemoryRouter>
        <WorktreeExplorer
          projectId="demo"
          worktreePath="<workspace>/demo"
          selected="src/new.ts"
          onSelect={select}
          gitFiles={gitFiles}
        />
      </MemoryRouter>,
    );
  await act(async () => render(files));
  expect(
    host.querySelector('[aria-label="git.directoryChanges: 1"]'),
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
  expect(
    host.querySelector('[aria-label="git.directoryChanges: 1"]'),
  ).toBeNull();
  expect(host.querySelector('[title="src/new.ts"]')).not.toBeNull();
});

it("requests Git status refresh alongside the file listing", async () => {
  const refresh = vi.fn();
  window.addEventListener("project-git-changed", refresh);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <WorktreeExplorer
            projectId="demo"
            worktreePath="<workspace>/demo"
            onSelect={vi.fn()}
          />
        </MemoryRouter>,
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

it("keeps ignored folders and their children browsable and explains their state", async () => {
  vi.mocked(getWorktreeFiles).mockImplementation(async (_id, _root, path) =>
    path === "cache"
      ? [
          {
            name: "output.txt",
            path: "cache/output.txt",
            is_dir: false,
            is_symlink: false,
            is_ignored: true,
          },
        ]
      : [
          {
            name: "cache",
            path: "cache",
            is_dir: true,
            is_symlink: false,
            is_ignored: true,
          },
        ],
  );
  const select = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter>
        <WorktreeExplorer
          projectId="demo"
          worktreePath="<workspace>"
          onSelect={select}
        />
      </MemoryRouter>,
    ),
  );
  const folder = host.querySelector<HTMLButtonElement>('[title="cache"]')!;
  expect(folder.getAttribute("aria-description")).toBe("worktree.gitIgnored");
  await act(async () => folder.click());
  const file = host.querySelector<HTMLButtonElement>(
    '[title="cache/output.txt"]',
  )!;
  expect(file.getAttribute("aria-description")).toBe("worktree.gitIgnored");
  await act(async () => file.click());
  expect(select).toHaveBeenCalledWith("cache/output.txt");
});

it("shows loading beside the expanded folder without adding a loading text row", async () => {
  let complete!: (
    entries: Awaited<ReturnType<typeof getWorktreeFiles>>,
  ) => void;
  const pending = new Promise<Awaited<ReturnType<typeof getWorktreeFiles>>>(
    (resolve) => {
      complete = resolve;
    },
  );
  vi.mocked(getWorktreeFiles).mockImplementation(async (_id, _root, path) =>
    path === "src"
      ? pending
      : [{ name: "src", path: "src", is_dir: true, is_symlink: false }],
  );
  await act(async () =>
    root.render(
      <MemoryRouter>
        <WorktreeExplorer
          projectId="demo"
          worktreePath="<workspace>"
          onSelect={vi.fn()}
        />
      </MemoryRouter>,
    ),
  );
  const folder = host.querySelector<HTMLButtonElement>('[title="src"]')!;
  await act(async () => folder.click());
  expect(
    folder.querySelector('[role="status"][aria-label="common.loading"]'),
  ).not.toBeNull();
  expect(host.textContent).not.toContain("common.loading");
  expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  await act(async () =>
    complete([
      {
        name: "example.ts",
        path: "src/example.ts",
        is_dir: false,
        is_symlink: false,
      },
    ]),
  );
  expect(folder.querySelector('[role="status"]')).toBeNull();
  expect(host.querySelector('[title="src/example.ts"]')).not.toBeNull();
});

it("refreshes newly created files only for the matching checkout", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <WorktreeExplorer
          projectId="demo"
          worktreePath="/projects/demo"
          onSelect={() => {}}
        />
      </MemoryRouter>,
    ),
  );
  vi.mocked(getWorktreeFiles).mockResolvedValue([
    { name: "notes.md", path: "notes.md", is_dir: false, is_symlink: false },
  ]);
  const changed = async (projectId: string) =>
    act(async () => {
      window.dispatchEvent(
        new CustomEvent("agent-hub:worktree-files-changed", {
          detail: { projectId, worktreePath: "/projects/demo" },
        }),
      );
    });
  await changed("other");
  expect(host.textContent).not.toContain("notes.md");
  await changed("demo");
  expect(host.textContent).toContain("notes.md");
});
