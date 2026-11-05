import type { AgentDeliveryAdapter } from "../../lib/agentDelivery";
import { relativeDirectoryPath } from "../../lib/directoryPath";
import {
  DEFAULT_HERDR_SESSION,
  getHerdrInventory,
  getHerdrSnapshot,
  herdrTarget,
  runHerdrAction,
  type HerdrSnapshot,
} from "./lib/herdrControlApi";

/** Resolve only the current checkout; focus elsewhere must never redirect feedback. */
export function currentWorkspaceAgent(snapshot: HerdrSnapshot, path: string) {
  const spaces = new Map(
    snapshot.workspaces.map((space) => [space.workspace_id, space]),
  );
  const candidates = snapshot.agents.filter((pane) => {
    const space = spaces.get(pane.workspace_id);
    return (
      !!pane.agent &&
      space?.active_tab_id === pane.tab_id &&
      relativeDirectoryPath(path, pane.cwd ?? space.directory) === "."
    );
  });
  const focused = candidates.filter((pane) => pane.focused);
  if (focused.length) return focused.length === 1 ? focused[0] : undefined;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** An embedded client owns a workspace; select an unclaimed Agent inside it. */
export function embeddedWorkspaceAgent(
  snapshot: HerdrSnapshot,
  client: import("./lib/herdrControlApi").HerdrTarget,
  path: string,
  claimed: string[],
) {
  const pane = currentWorkspaceAgent(
    {
      ...snapshot,
      agents: snapshot.agents.filter(
        (pane) =>
          pane.workspace_id === client.workspace_id &&
          !claimed.includes(pane.terminal_id),
      ),
    },
    path,
  );
  return pane ? herdrTarget(client.session, pane) : undefined;
}

export const herdrDeliveryAdapter: AgentDeliveryAdapter = {
  id: "herdr",
  label: "Herdr",
  resolveCurrent: async (workspacePath) => {
    if (!workspacePath) return null;
    const inventory = await getHerdrInventory();
    if (
      !inventory.installed ||
      !inventory.sessions.some(
        (session) => session.name === DEFAULT_HERDR_SESSION && session.running,
      )
    )
      return null;
    const snapshot = await getHerdrSnapshot(DEFAULT_HERDR_SESSION);
    const pane = currentWorkspaceAgent(snapshot, workspacePath);
    if (!pane) return null;
    const target = herdrTarget(DEFAULT_HERDR_SESSION, pane);
    return { send: (prompt) => runHerdrAction(target, "prompt", prompt) };
  },
};
