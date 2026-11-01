import { expect, it } from "vitest";
import { layoutGitGraph } from "./gitGraph";
import type { GitGraphCommit } from "./gitApi";
const commit = (sha: string, parents: string[]): GitGraphCommit => ({
  sha,
  parents,
  summary: sha,
  author: "Example",
  time: 0,
  refs: [],
});
it("draws merge lanes that converge at their shared parent", () => {
  const { rows, width } = layoutGitGraph([
    commit("merge", ["left", "right"]),
    commit("right", ["base"]),
    commit("left", ["base"]),
    commit("base", []),
  ]);
  expect(width).toBe(2);
  expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 1]);
  expect(rows[0].edges).toContainEqual({
    from: 0,
    to: 1,
    half: "bottom",
    color: 1,
  });
  expect(rows[2].edges).toContainEqual({
    from: 0,
    to: 1,
    half: "bottom",
    color: 1,
  });
  expect(rows[3].edges.filter((edge) => edge.half === "bottom")).toEqual([]);
});
it("reuses an empty lane for independent history without inventing an incoming edge", () => {
  const { rows, width } = layoutGitGraph([
    commit("one", []),
    commit("two", []),
  ]);
  expect(width).toBe(1);
  expect(rows[1]).toEqual({ lane: 0, edges: [] });
});
