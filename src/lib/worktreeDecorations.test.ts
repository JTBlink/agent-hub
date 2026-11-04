import { expect, it } from "vitest";
import type { GitFile } from "./gitApi";
import { worktreeDecorations } from "./worktreeDecorations";

function file(path: string, status: string, staged = false): GitFile {
  return { path, status, staged, unstaged: !staged, conflicted: false };
}

it("distinguishes untracked, staged additions, modifications and renames", () => {
  const entries = worktreeDecorations([
    file("new.txt", "added"),
    file("staged.txt", "added", true),
    file("changed.txt", "modified"),
    file("renamed.txt", "renamed", true),
  ]);
  expect([...entries.values()].map(({ marker }) => marker)).toEqual([
    "U",
    "A",
    "M",
    "R",
  ]);
  expect(entries.has("clean.txt")).toBe(false);
});

it("aggregates nested changes before directories are loaded, with conflict priority", () => {
  const entries = worktreeDecorations([
    file("docs/nested/new.md", "added"),
    file("docs/changed.md", "modified"),
    { ...file("docs/conflict.md", "modified"), conflicted: true },
    file("docs/deleted.md", "deleted"),
  ]);
  expect(entries.get("docs")).toMatchObject({ status: "conflict", count: 4 });
  expect(entries.get("docs/nested")).toMatchObject({
    status: "untracked",
    count: 1,
  });
  expect(entries.has("doc")).toBe(false);
  expect(worktreeDecorations([]).size).toBe(0);
});

it("counts one path once across staging areas and preserves each folder's status breakdown", () => {
  const entries = worktreeDecorations([
    file("tasks/task.json", "added", true),
    file("tasks/task.json", "modified"),
    file("tasks/old.md", "deleted"),
    file("tasks/new.md", "added"),
  ]);
  expect(entries.get("tasks")).toMatchObject({
    count: 3,
    counts: { modified: 1, deleted: 1, untracked: 1 },
  });
  expect(entries.get("tasks/task.json")).toMatchObject({
    marker: "M",
    count: 1,
  });
});
