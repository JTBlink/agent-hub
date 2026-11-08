import * as api from "../api";
import { DEFAULT_HERDR_SESSION } from "./herdrControlApi";
import { herdrAgentLabel, type HerdrAgent } from "../../../lib/terminalAgents";

type ProjectAgentAttachment = api.HerdrOpenedWorkspace & { warning: string };

/** Show a fresh project Agent tab as soon as its shell exists, then report readiness. */
export async function openProjectHerdrAgent(
  projectId: string,
  path: string | undefined,
  agent: HerdrAgent,
  verify: () => boolean,
  onCreated?: (opened: ProjectAgentAttachment) => void,
) {
  const kind = agent === "claude_teams" ? "claude" : agent;
  const prefix = `hub-${agent.replaceAll("_", "-")}-`;
  const opened = await api.ensureHerdrWorkspace(
    DEFAULT_HERDR_SESSION,
    projectId,
    path,
  );
  if (!verify()) return null;
  let shown = false;
  const showCreated = (target: api.HerdrTarget) => {
    if (shown || !verify()) return;
    shown = true;
    onCreated?.({ ...opened, target, warning: "" });
  };
  const started = await api.startHerdrAgent(
    opened.target,
    {
      kind,
      name: `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      direction: "tab",
      tab_label: herdrAgentLabel(agent),
      prompt: "",
      ...(agent === "claude_teams" ? { teams: true } : {}),
    },
    showCreated,
  );
  if (!verify()) return null;
  // Older servers can return the finished target without the early notification.
  if (!shown) {
    await api.openHerdrWorkspace(
      DEFAULT_HERDR_SESSION,
      started.target.workspace_id,
      started.target.pane_id,
    );
    if (!verify()) return null;
  }
  showCreated(started.target);
  return {
    ...opened,
    target: started.target,
    warning: started.warning ?? "",
  };
}
