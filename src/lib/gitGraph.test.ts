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
  expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 0]);
  expect(rows[0].edges).toContainEqual({
    from: 0,
    to: 1,
    half: "bottom",
    color: 1,
  });
  expect(rows[2].edges).toContainEqual({
    from: 0,
    to: 0,
    half: "bottom",
    color: 0,
  });
  expect(rows[3].edges.filter((edge) => edge.half === "bottom")).toEqual([]);
});
it("reuses an empty lane for independent history without inventing an incoming edge", () => {
  const { rows, width } = layoutGitGraph([
    commit("one", []),
    commit("two", []),
  ]);
  expect(width).toBe(1);
  expect(rows[1]).toEqual({ lane: 0, color: 1, edges: [] });
});

it("connects working changes to HEAD while independent branch tips keep distinct colors", () => {
  const nodes = [
    commit("docs-a", ["head"]),
    commit("docs-b", ["head"]),
    commit("head", ["base"]),
    commit("base", []),
  ];
  const { rows } = layoutGitGraph(nodes, "head");
  expect(rows.map((row) => row.lane)).toEqual([1, 2, 0, 0]);
  expect(rows.map((row) => row.color)).toEqual([1, 2, 0, 0]);
  expect(rows[0].edges).toContainEqual({
    from: 0,
    to: 0,
    half: "top",
    color: -1,
  });
  expect(rows[1].edges).toContainEqual({
    from: 0,
    to: 0,
    half: "bottom",
    color: -1,
  });
  expect(rows[2].edges).toContainEqual({
    from: 0,
    to: 0,
    half: "top",
    color: -1,
  });
  expect(rows[2].edges).toContainEqual({
    from: 0,
    to: 0,
    half: "bottom",
    color: 0,
  });
  expect(rows[2].edges).toContainEqual({
    from: 1,
    to: 0,
    half: "top",
    color: 1,
  });
  expect(rows[2].edges).toContainEqual({
    from: 2,
    to: 0,
    half: "top",
    color: 2,
  });
});

it("keeps existing geometry when a truncated history is extended, including an octopus merge", () => {
  const nodes = [
    { sha: "merge", parents: ["left", "middle", "right"] },
    { sha: "left", parents: ["base"] },
    { sha: "middle", parents: ["base"] },
    { sha: "right", parents: ["base"] },
    { sha: "base", parents: [] },
  ];
  const partial = layoutGitGraph(nodes.slice(0, 2));
  const full = layoutGitGraph(nodes);
  expect(full.rows.slice(0, 2)).toEqual(partial.rows);
  expect(full.width).toBe(3);
  expect(full.rows[4].edges.filter((edge) => edge.half === "bottom")).toEqual(
    [],
  );
  for (let i = 0; i < full.rows.length - 1; i++) {
    const outgoing = full.rows[i].edges
      .filter((edge) => edge.half === "bottom")
      .map((edge) => edge.to);
    const incoming = full.rows[i + 1].edges
      .filter((edge) => edge.half === "top")
      .map((edge) => edge.from);
    expect(new Set(outgoing)).toEqual(new Set(incoming));
  }
});
