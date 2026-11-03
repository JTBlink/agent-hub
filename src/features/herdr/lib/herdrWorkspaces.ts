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

export function reconcileHerdrWorkspaceOrder(
  spaces: HerdrWorkspace[],
  savedOrder: string[],
) {
  const rootIds = groupHerdrWorkspaces(spaces).roots.map(
    (space) => space.workspace_id,
  );
  const available = new Set(rootIds);
  return [
    ...savedOrder.filter(
      (id, index) => available.has(id) && savedOrder.indexOf(id) === index,
    ),
    ...rootIds.filter((id) => !savedOrder.includes(id)),
  ];
}

export function orderHerdrWorkspaces(
  spaces: HerdrWorkspace[],
  savedOrder: string[],
) {
  const { roots, children } = groupHerdrWorkspaces(spaces);
  const order = reconcileHerdrWorkspaceOrder(spaces, savedOrder);
  const byId = new Map(roots.map((space) => [space.workspace_id, space]));
  return order.flatMap((id) => {
    const root = byId.get(id);
    return root ? [root, ...(children.get(id) ?? [])] : [];
  });
}

export function moveHerdrWorkspaceRoot(
  spaces: HerdrWorkspace[],
  savedOrder: string[],
  activeId: string,
  overId: string,
) {
  const order = reconcileHerdrWorkspaceOrder(spaces, savedOrder);
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
