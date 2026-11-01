// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useGitHistoryPages } from "./useGitHistoryPages";
import {
  getProjectGitHistory,
  type GitHistoryPage,
  type GitStatus,
} from "../lib/gitApi";
vi.mock("../lib/gitApi", () => ({ getProjectGitHistory: vi.fn() }));
const commit = (index: number) => ({
  sha: index.toString(16).padStart(40, "0"),
  summary: `Commit ${index}`,
  author: "example",
  time: 1000 + index,
});
const initial: GitStatus["commits"] = Array.from({ length: 30 }, (_, index) =>
  commit(index),
);
function Harness({
  projectId = "first",
  initialCommits = initial,
}: {
  projectId?: string;
  initialCommits?: GitStatus["commits"];
}) {
  const history = useGitHistoryPages({
    projectId,
    sha: initial[0].sha,
    initial: initialCommits,
  });
  return (
    <div>
      <p data-rows>
        {history.commits.map((commit) => commit.summary).join(",")}
      </p>
      <p data-error>{history.error ? "Read failed" : ""}</p>
      <button
        disabled={history.loading || !history.hasMore}
        onClick={history.loadMore}
      >
        More
      </button>
      <button data-retry disabled={history.loading} onClick={history.retry}>
        Retry
      </button>
    </div>
  );
}
it("appends recent history once, preserves rows on failure, retries the same page and stops at the end", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getProjectGitHistory)
    .mockRejectedValueOnce(Error("Read failed"))
    .mockResolvedValueOnce({ commits: [commit(30)], has_more: false });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    expect(getProjectGitHistory).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("[data-error]")?.textContent).toBe("Read failed");
    expect(host.querySelector("[data-rows]")?.textContent).toContain(
      "Commit 29",
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-retry]")!.click(),
    );
    expect(getProjectGitHistory).toHaveBeenNthCalledWith(
      1,
      "first",
      undefined,
      initial[0].sha,
      30,
    );
    expect(getProjectGitHistory).toHaveBeenNthCalledWith(
      2,
      "first",
      undefined,
      initial[0].sha,
      30,
    );
    expect(
      host.querySelector("[data-rows]")?.textContent?.split(","),
    ).toHaveLength(31);
    expect(host.querySelector("button")?.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("ignores a pending page after switching checkout", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (page: GitHistoryPage) => void;
  vi.mocked(getProjectGitHistory).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("button")?.disabled).toBe(true);
    await act(async () => root.render(<Harness projectId="second" />));
    await act(async () => finish({ commits: [commit(99)], has_more: false }));
    expect(host.querySelector("[data-rows]")?.textContent).not.toContain(
      "Commit 99",
    );
    expect(host.querySelector("button")?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
