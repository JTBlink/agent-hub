// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitHistory } from "./GitHistory";
import {
  getProjectGitReferences,
  getProjectGitCommit,
  getProjectGitHistory,
} from "../../lib/gitApi";
import type { GitStatus } from "../../lib/gitApi";

const translate = (key: string) => key;
vi.mock("../../lib/gitApi", () => ({
  getProjectGitReferences: vi.fn(),
  getProjectGitCommit: vi.fn(),
  getProjectGitHistory: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n: { language: "en" } }),
}));
const status: GitStatus = {
  branch: "feature/a-very-long-branch-name",
  head: "abcdef1234567890",
  upstream: "origin/main",
  ahead: 2,
  behind: 1,
  state: "Clean",
  files: [],
  truncated: false,
  commits: [
    {
      sha: "abcdef1234567890",
      summary:
        "Improve workspace navigation and preserve the complete commit title",
      author: "example",
      time: 1793408400,
    },
  ],
};

it("shows cached branch comparison and allows collapsing history without losing commit details", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<GitHistory status={status} loading={false} />),
    );
    expect(
      host.querySelector('[title="git.loadedCommitCount"]')?.textContent,
    ).toBe("1");
    expect(host.textContent).toContain(status.branch);
    expect(host.textContent).toContain("origin/main");
    expect(
      host.querySelector('[aria-label="git.aheadCount"]')?.textContent,
    ).toContain("2");
    expect(
      host.querySelector('[aria-label="git.behindCount"]')?.textContent,
    ).toContain("1");
    expect(host.querySelector('[aria-label="git.cachedRefs"]')).not.toBeNull();
    const summary = host.querySelector("summary")!;
    expect(summary.textContent).toContain(status.commits[0].summary);
    await act(async () => summary.click());
    expect(host.querySelector("details")?.open).toBe(true);
    expect(host.querySelector("details")?.textContent).toContain(status.head);
    expect(host.querySelector("time")?.dateTime).toBe(
      new Date(status.commits[0].time * 1000).toISOString(),
    );
    const toggle = host.querySelector("button")!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("ol")).toBeNull();
    await act(async () => toggle.click());
    expect(host.querySelector("ol")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("distinguishes loading, failed history, unborn branches and missing upstream", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<GitHistory loading />));
    expect(host.textContent).toContain("common.loading");
    expect(host.textContent).not.toContain("git.unborn");
    await act(async () => root.render(<GitHistory loading={false} />));
    expect(host.textContent).toContain("git.historyUnavailable");
    await act(async () =>
      root.render(
        <GitHistory
          loading={false}
          status={{
            ...status,
            branch: null,
            head: null,
            commits: [],
            upstream: null,
            ahead: 0,
            behind: 0,
          }}
        />,
      ),
    );
    expect(host.textContent).toContain("git.unborn");
    expect(host.textContent).toContain("git.noUpstream");
    expect(host.textContent).not.toContain("git.refsMatch");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("navigates repository icons, lazily expands tags, retries reads and filters by recent contributor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitReferences)
    .mockRejectedValueOnce(new Error("Read failed"))
    .mockResolvedValue({
      entries: [{ kind: "tags", name: "v1.0.0", sha: status.head }],
      truncated: false,
    });
  vi.mocked(getProjectGitHistory).mockResolvedValue({
    commits: status.commits,
    has_more: false,
  });
  vi.mocked(getProjectGitCommit).mockClear();
  vi.mocked(getProjectGitCommit).mockResolvedValue({
    sha: status.head!,
    message: "Tagged commit",
    author: "example",
    committer: "example",
    author_email: "user@example.invalid",
    committer_email: "user@example.invalid",
    time: 1000,
    parents: [],
    additions: 0,
    deletions: 0,
    files: [],
    truncated: false,
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onRefresh = vi.fn();
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () =>
      root.render(
        <GitHistory
          status={status}
          loading={false}
          target={{ projectId: "demo" }}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />,
      ),
    );
    expect(getProjectGitReferences).not.toHaveBeenCalled();
    await act(async () => button("git.browse.tags").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Read failed",
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((el) => el.textContent === "common.retry")!
        .click(),
    );
    expect(host.textContent).toContain("v1.0.0");
    expect(button("git.browse.tags").getAttribute("aria-pressed")).toBe("true");
    expect(getProjectGitCommit).not.toHaveBeenCalled();
    await act(async () => {
      const details = host.querySelector("details")!;
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(getProjectGitHistory).toHaveBeenCalledWith(
      "demo",
      undefined,
      status.head,
      0,
    );
    expect(getProjectGitCommit).not.toHaveBeenCalled();
    await act(async () => {
      const details = host.querySelector<HTMLDetailsElement>(
        ".git-history-commit",
      )!;
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(getProjectGitCommit).toHaveBeenCalledWith(
      "demo",
      undefined,
      status.head,
    );
    expect(host.textContent).toContain("Tagged commit");
    await act(async () => button("settings.refresh").click());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => button("git.browse.contributors").click());
    const author = [...host.querySelectorAll("button")].find(
      (el) => el.title === "example",
    )!;
    await act(async () => author.click());
    expect(button("git.browse.commits").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(host.querySelector("input")?.value).toBe("example");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("sorts the tag snapshot from its context submenu and retains the choice across views and refresh", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitReferences)
    .mockClear()
    .mockResolvedValue({
      entries: [
        { kind: "tags", name: "v1.2.0", sha: status.head, time: 30 },
        { kind: "tags", name: "v1.10.0", sha: status.head, time: 20 },
        { kind: "tags", name: "v1.3.0", sha: status.head, time: 10 },
      ],
      truncated: false,
    });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const names = () =>
    [...host.querySelectorAll("summary")].map((item) => item.title);
  const choose = async (label: string) => {
    await act(async () =>
      host
        .querySelector("section")!
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        ),
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[role="menuitem"][aria-haspopup="menu"]',
        )!
        .click(),
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          `[role="menuitemradio"][title="${label}"]`,
        )!
        .click(),
    );
  };
  try {
    await act(async () =>
      root.render(
        <GitHistory
          status={status}
          loading={false}
          target={{ projectId: "demo" }}
          onRefresh={() => {}}
        />,
      ),
    );
    await act(async () => button("git.browse.tags").click());
    expect(names()).toEqual(["v1.3.0", "v1.2.0", "v1.10.0"]);
    const expanded = host.querySelector('summary[title="v1.2.0"]')!
      .parentElement as HTMLDetailsElement;
    await act(async () => {
      expanded.open = true;
      expanded.dispatchEvent(new Event("toggle"));
    });
    await choose("git.tagSort.version");
    expect(names()).toEqual(["v1.10.0", "v1.3.0", "v1.2.0"]);
    await choose("git.tagSort.name");
    expect(names()).toEqual(["v1.3.0", "v1.2.0", "v1.10.0"]);
    expect(expanded.open).toBe(true);
    await choose("git.tagSort.asc");
    expect(names()).toEqual(["v1.10.0", "v1.2.0", "v1.3.0"]);
    await choose("git.tagSort.date");
    expect(names()).toEqual(["v1.3.0", "v1.10.0", "v1.2.0"]);
    expect(getProjectGitReferences).toHaveBeenCalledTimes(1);
    await act(async () => button("git.browse.commits").click());
    await act(async () => button("git.browse.tags").click());
    expect(names()).toEqual(["v1.3.0", "v1.10.0", "v1.2.0"]);
    await act(async () => button("settings.refresh").click());
    expect(names()).toEqual(["v1.3.0", "v1.10.0", "v1.2.0"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
