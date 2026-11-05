import * as api from "../api";
import { DEFAULT_HERDR_SESSION, herdrTarget } from "./herdrControlApi";
import { herdrAgents, type HerdrAgent } from "../../../lib/terminalAgents";

/** All project Agent entry points share directory routing and configured Herdr startup. */
export async function openProjectHerdrAgent(
  projectId: string,
  path: string | undefined,
  agent: HerdrAgent,
  verify: () => boolean,
) {
  const choice = herdrAgents.find((item) => item.id === agent)!;
  const kind = agent === "claude_teams" ? "claude" : agent;
  const prefix = `hub-${agent.replaceAll("_", "-")}-`;
  const opened = await api.ensureHerdrWorkspace(
    DEFAULT_HERDR_SESSION,
    projectId,
    path,
  );
  if (!verify()) return null;
  const snapshot = await api.getHerdrSnapshot(DEFAULT_HERDR_SESSION);
  if (!verify()) return null;
  const matching = snapshot.agents.filter(
    (pane) =>
      pane.workspace_id === opened.target.workspace_id &&
      pane.cwd === opened.path &&
      pane.agent === kind &&
      (agent === "claude_teams"
        ? pane.name?.startsWith(prefix)
        : !pane.name?.startsWith("hub-claude-teams-")),
  );
  if (matching.length)
    return {
      ...opened,
      target: herdrTarget(DEFAULT_HERDR_SESSION, matching[0]),
      warning: "",
      title: `${choice.label} · Herdr`,
    };
  try {
    const started = await api.startHerdrAgent(opened.target, {
      kind,
      name: `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      direction: "right",
      prompt: "",
      ...(agent === "claude_teams" ? { teams: true } : {}),
    });
    return {
      ...opened,
      target: started.target,
      warning: started.warning ?? "",
      title: `${choice.label} · Herdr`,
    };
  } catch (cause) {
    // Preserve the workspace if an interrupted request may have created a pane.
    return {
      ...opened,
      warning: String(cause),
      title: `${choice.label} · Herdr`,
    };
  }
}
