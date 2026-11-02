import type { HerdrSnapshot, HerdrTarget } from "./herdrControlApi";

/** Global focus can be absent for an attached client. Resolve only unambiguous live targets. */
export function herdrFocusedPane(snapshot: HerdrSnapshot, target: HerdrTarget) {
  const activeTabs = new Map(
    snapshot.workspaces.map((space) => [
      space.workspace_id,
      space.active_tab_id,
    ]),
  );
  const activePanes = snapshot.panes.filter(
    (pane) => activeTabs.get(pane.workspace_id) === pane.tab_id,
  );
  const focused = activePanes.filter((pane) => pane.focused);
  // Switching spaces in the TUI does not replace the attached PTY or its saved target.
  if (focused.length === 1) return focused[0];
  if (focused.length > 1) return undefined;
  const panes = activePanes.filter(
    (pane) => pane.workspace_id === target.workspace_id,
  );
  if (panes.length !== 1) return undefined;
  const pane = panes[0];
  return pane.pane_id === target.pane_id &&
    pane.terminal_id === target.terminal_id
    ? pane
    : undefined;
}
