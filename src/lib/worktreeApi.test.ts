import { expect, it } from "vitest";
import {
  projectCheckoutRoute,
  projectWorkspaceRoute,
  worktreeLabel,
} from "./worktreeApi";

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

it("retains checkout context on project skills pages without treating them as terminal pages", () => {
  const search = `?${new URLSearchParams({ worktree: "~/projects/demo/topic" })}`;
  const checkout = { projectId: "demo", worktreePath: "~/projects/demo/topic" };
  expect(projectCheckoutRoute("/project/demo/skills", search)).toEqual(
    checkout,
  );
  expect(projectCheckoutRoute("/project/demo", search)).toEqual(checkout);
  expect(projectWorkspaceRoute("/project/demo/skills", search)).toBeNull();
  expect(projectWorkspaceRoute("/project/demo", search)).toEqual(checkout);
  expect(projectCheckoutRoute("/my-skills", search)).toBeNull();
});
