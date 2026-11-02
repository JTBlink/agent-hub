// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { GitGraphCommit } from "../../lib/gitApi";
import { GitGraphBranchFilter } from "./GitGraphBranchFilter";
import {
  graphBranchOptions,
  graphBranchHistory,
} from "../../lib/gitGraphBranches";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const commit = (
  sha: string,
  parents: string[],
  refs: GitGraphCommit["refs"] = [],
): GitGraphCommit => ({
  sha,
  parents,
  refs,
  author: "Example",
  summary: sha,
  time: 0,
});
const commits = [
  commit("merge", ["local", "remote"], [{ name: "main", remote: false }]),
  commit(
    "local",
    ["base"],
    [
      { name: "topic", remote: false },
      { name: "v1", kind: "tag", remote: false },
    ],
  ),
  commit("remote", ["base"], [{ name: "origin/topic", remote: true }]),
  commit("unrelated", []),
  commit("base", []),
];
it("distinguishes local and remote refs, excludes tags and preserves merge ancestors", () => {
  expect(
    graphBranchOptions(commits).map((option) => [option.name, option.remote]),
  ).toEqual([
    ["main", false],
    ["topic", false],
    ["origin/topic", true],
  ]);
  expect(
    graphBranchHistory(commits, "merge").map((commit) => commit.sha),
  ).toEqual(["merge", "local", "remote", "base"]);
  expect(
    graphBranchHistory(commits, "remote").map((commit) => commit.sha),
  ).toEqual(["remote", "base"]);
  expect(graphBranchHistory(commits)).toBe(commits);
});
it("offers distinct branch kinds and emits the chosen remote ref", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GitGraphBranchFilter commits={commits} value="" onChange={onChange} />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
    );
    const options = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    expect(options.map((option) => option.textContent)).toEqual([
      "git.graph.allBranches",
      "git.graph.localBranch · main",
      "git.graph.localBranch · topic",
      "git.graph.remoteBranch · origin/topic",
    ]);
    await act(async () => options[3].click());
    expect(onChange).toHaveBeenCalledWith(
      JSON.stringify([true, "origin/topic"]),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
