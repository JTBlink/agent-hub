import type { HerdrWorkspace } from "./herdrControlApi";

/** Group only checkouts whose ownership is explicitly supplied by Herdr. */
export function groupHerdrWorkspaces(spaces: HerdrWorkspace[]) {
  const children = new Map<string, HerdrWorkspace[]>();
  const roots = spaces.filter((space) => {
    const parent =
      space.worktree?.is_linked_worktree &&
      spaces.find(
        (candidate) =>
          !candidate.worktree?.is_linked_worktree &&
          candidate.worktree?.repo_key === space.worktree?.repo_key,
      );
    if (!parent) return true;
    const list = children.get(parent.workspace_id) ?? [];
    list.push(space);
    children.set(parent.workspace_id, list);
    return false;
  });
  return { roots, children };
}
