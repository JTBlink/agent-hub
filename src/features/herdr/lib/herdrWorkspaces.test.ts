import { expect, it } from "vitest";
import type { HerdrWorkspace } from "./herdrControlApi";
import {
  moveHerdrWorkspaceRoot,
  orderHerdrWorkspaces,
  reconcileHerdrWorkspaceOrder,
} from "./herdrWorkspaces";

const spaces: HerdrWorkspace[] = [
  {
    workspace_id: "child-a",
    label: "work-issue",
    directory: "/projects/a-work",
    branch: "work-issue",
    active_tab_id: "child-a:tab",
    worktree: {
      repo_key: "repo-a",
      checkout_path: "/projects/a-work",
      is_linked_worktree: true,
    },
  },
  {
    workspace_id: "root-a",
    label: "project-a",
    directory: "/projects/a",
    branch: "main",
    active_tab_id: "root-a:tab",
    worktree: {
      repo_key: "repo-a",
      checkout_path: "/projects/a",
      is_linked_worktree: false,
    },
  },
  {
    workspace_id: "root-b",
    label: "project-b",
    directory: "/projects/b",
    branch: "main",
    active_tab_id: "root-b:tab",
  },
];

it("reconciles a saved root order with current workspaces", () => {
  expect(
    reconcileHerdrWorkspaceOrder(spaces, ["removed", "root-b", "root-b"]),
  ).toEqual(["root-b", "root-a"]);
});

it("moves a root workspace together with its linked worktrees", () => {
  const order = moveHerdrWorkspaceRoot(
    spaces,
    ["root-a", "root-b"],
    "root-b",
    "root-a",
  );
  expect(order).toEqual(["root-b", "root-a"]);
  expect(
    orderHerdrWorkspaces(spaces, order).map((space) => space.workspace_id),
  ).toEqual(["root-b", "root-a", "child-a"]);
});
