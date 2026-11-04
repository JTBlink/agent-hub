// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitCommitDetails } from "./GitCommitDetails";
import {
  getProjectGitCommit,
  type GitCommitDetails as Details,
} from "../../lib/gitApi";

const translate = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n: { language: "en" } }),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/gitApi", () => ({ getProjectGitCommit: vi.fn() }));
const data: Details = {
  sha: "a".repeat(40),
  message: "Improve parser\n\nKeep empty inputs safe",
  author: "example",
  committer: "example",
  author_email: "user@example.invalid",
  committer_email: "user@example.invalid",
  time: 1793408400,
  parents: ["b".repeat(40)],
  additions: 3,
  deletions: 1,
  truncated: false,
  files: [
    {
      path: "src/parser.rs",
      old_path: null,
      status: "modified",
      additions: 3,
      deletions: 1,
    },
    { path: "tests/parser.rs", old_path: null, status: "added" },
  ],
};
it("expands directories and commit metadata, opens historical files without staging controls and retries errors", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitCommit)
    .mockRejectedValueOnce(new Error("Read failed"))
    .mockResolvedValue(data);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onSelect = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GitCommitDetails
          target={{ projectId: "demo" }}
          sha={data.sha}
          onSelect={onSelect}
        />,
      ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Read failed",
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(host.textContent).toContain("+3");
    const folder = [...host.querySelectorAll("summary")].find(
      (el) => el.textContent === "src",
    )!;
    expect(folder.parentElement?.hasAttribute("open")).toBe(true);
    await act(async () => folder.click());
    expect(folder.parentElement?.hasAttribute("open")).toBe(false);
    await act(async () => folder.click());
    const file = host.querySelector<HTMLButtonElement>(
      '[aria-label="git.commitFile: src/parser.rs"]',
    )!;
    await act(async () => file.click());
    expect(onSelect).toHaveBeenCalledWith({
      sha: data.sha,
      path: "src/parser.rs",
    });
    expect(host.querySelector('[aria-label*="git.stageFile"]')).toBeNull();
    const metadata = host.querySelector("details")!;
    await act(async () => metadata.querySelector("summary")!.click());
    expect(metadata.open).toBe(true);
    expect(metadata.textContent).toContain(data.message);
    expect(metadata.textContent).toContain(data.parents[0]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("ignores a previous checkout response after the target changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (data: Details) => void;
  vi.mocked(getProjectGitCommit)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue({ ...data, message: "Current checkout" });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GitCommitDetails
          target={{ projectId: "old" }}
          sha={data.sha}
          onSelect={vi.fn()}
        />,
      ),
    );
    await act(async () =>
      root.render(
        <GitCommitDetails
          target={{ projectId: "new" }}
          sha={data.sha}
          onSelect={vi.fn()}
        />,
      ),
    );
    await act(async () => finish(data));
    expect(host.textContent).toContain("Current checkout");
    expect(host.textContent).not.toContain(data.message);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("opens graph metadata immediately and shows identities, full message, file counts and selectable parents", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitCommit).mockResolvedValue(data);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onParent = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GitCommitDetails
          target={{ projectId: "graph" }}
          sha={data.sha}
          expanded
          onSelect={vi.fn()}
          onSelectParent={onParent}
        />,
      ),
    );
    expect(host.querySelector("details")?.open).toBe(true);
    expect(host.textContent).toContain(data.message);
    expect(host.textContent).toContain(data.sha);
    expect(host.textContent).toContain("user@example.invalid");
    expect(
      host.querySelector('[aria-label="git.commitFile: src/parser.rs"]')
        ?.textContent,
    ).toContain("+3 / −1");
    const parent = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === data.parents[0],
    )!;
    await act(async () => parent.click());
    expect(onParent).toHaveBeenCalledWith(data.parents[0]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("replaces the native file menu and dispatches revision, working comparison and open actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitCommit).mockResolvedValue(data);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GitCommitDetails
          target={{ projectId: "demo", worktreePath: "/workspace/demo" }}
          sha={data.sha}
          onSelect={onSelect}
        />,
      ),
    );
    const file = host.querySelector<HTMLButtonElement>(
      '[aria-label="git.commitFile: src/parser.rs"]',
    )!;
    for (const [label, view] of [
      ["git.viewRevision", "revision"],
      ["git.compareWorking", "working"],
      ["fileTree.open", "file"],
    ]) {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        file.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      const menu = document.querySelector('[role="menu"]')!;
      expect(menu.textContent).toContain("fileTree.copyPath");
      expect(menu.textContent).toContain("fileTree.copyRelativePath");
      const action = [
        ...menu.querySelectorAll<HTMLButtonElement>("button"),
      ].find((button) => button.textContent === label)!;
      await act(async () => action.click());
      expect(onSelect).toHaveBeenLastCalledWith({
        sha: data.sha,
        path: "src/parser.rs",
        view,
      });
    }
    await act(async () => {
      file.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(file);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
