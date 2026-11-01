// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useGitGraph } from "./useGitGraph";
import { getProjectGitGraph, type GitGraphData } from "../lib/gitApi";
vi.mock("../lib/gitApi", () => ({ getProjectGitGraph: vi.fn() }));
function Harness({
  project = "first",
  limit = 200,
}: {
  project?: string;
  limit?: number;
}) {
  const result = useGitGraph(project, undefined, true, limit, 0);
  return (
    <p data-loading={!result || result.loading} data-error={!!result?.error}>
      {result?.data?.commits.map((commit) => commit.summary).join(",")}
    </p>
  );
}
it("retains rows while expanding and on failure, isolates checkouts and ignores stale responses", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const page: GitGraphData = {
    commits: [
      {
        sha: "a",
        summary: "Original",
        parents: [],
        refs: [],
        author: "Example",
        time: 0,
      },
    ],
    has_more: true,
  };
  let fail!: (reason: Error) => void;
  let finish!: (data: GitGraphData) => void;
  vi.mocked(getProjectGitGraph)
    .mockResolvedValueOnce(page)
    .mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce({ commits: [], has_more: false });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => root.render(<Harness limit={400} />));
    expect(host.textContent).toBe("Original");
    expect(host.firstElementChild?.getAttribute("data-loading")).toBe("true");
    await act(async () => fail(new Error("Read failed")));
    expect(host.textContent).toBe("Original");
    expect(host.firstElementChild?.getAttribute("data-error")).toBe("true");
    await act(async () => root.render(<Harness limit={600} />));
    await act(async () => root.render(<Harness project="second" />));
    await act(async () => finish(page));
    expect(host.textContent).toBe("");
    expect(host.firstElementChild?.getAttribute("data-loading")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
