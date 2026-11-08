import * as api from "../api";
import { DEFAULT_HERDR_SESSION } from "./herdrControlApi";
import { herdrAgentLabel, type HerdrAgent } from "../../../lib/terminalAgents";

/** The explicit project launch opens a fresh Agent tab in the selected checkout. */
export async function openProjectHerdrAgent(
  projectId: string,
  path: string | undefined,
  agent: HerdrAgent,
  verify: () => boolean,
) {
  const kind = agent === "claude_teams" ? "claude" : agent;
  const prefix = `hub-${agent.replaceAll("_", "-")}-`;
  const opened = await api.ensureHerdrWorkspace(
    DEFAULT_HERDR_SESSION,
    projectId,
    path,
  );
  if (!verify()) return null;
  const started = await api.startHerdrAgent(opened.target, {
    kind,
    name: `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    direction: "tab",
    tab_label: herdrAgentLabel(agent),
    prompt: "",
    ...(agent === "claude_teams" ? { teams: true } : {}),
  });
  if (!verify()) return null;
  // A reused session client keeps its PTY; explicitly focus the newly created tab.
  await api.openHerdrWorkspace(
    DEFAULT_HERDR_SESSION,
    started.target.workspace_id,
    started.target.pane_id,
  );
  return {
    ...opened,
    target: started.target,
    warning: started.warning ?? "",
  };
}
