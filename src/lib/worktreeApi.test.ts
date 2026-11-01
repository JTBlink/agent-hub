import { expect, it } from "vitest";
import { worktreeLabel } from "./worktreeApi";

it("shows the worktree directory alongside a different branch and supports Windows paths", () => {
  const worktree = {
    path: "~/projects/demo-checkout/",
    branch: "feature/parser",
    head: "abc12345",
    is_main: false,
    locked: false,
    available: true,
  };
  expect(worktreeLabel(worktree)).toBe("demo-checkout · feature/parser");
  expect(
    worktreeLabel({ ...worktree, path: "C:\\projects\\demo-checkout" }),
  ).toBe("demo-checkout · feature/parser");
  expect(worktreeLabel({ ...worktree, branch: "demo-checkout" })).toBe(
    "demo-checkout",
  );
});
