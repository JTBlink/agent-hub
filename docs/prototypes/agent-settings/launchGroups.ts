import { initialAgents } from "./agentData";

export interface LaunchGroup {
  id: string;
  name: string;
  command: string;
}
export interface AgentGroups {
  groups: LaunchGroup[];
  defaultId: string;
}
// Native full-access commands for the four CLI Agents shown in the prototype.
// Match existing core/agent_launch_config defaults; do not invent other flags.
const fullAccessCommands: Record<string, string> = {
  codex: "codex --dangerously-bypass-approvals-and-sandbox",
  claude_code: "claude --dangerously-skip-permissions",
  opencode: "opencode --auto",
  hermes: "hermes --yolo",
};
export const initialGroups: Record<string, AgentGroups> = Object.fromEntries(
  initialAgents.map((agent) => [
    agent.key,
    {
      groups: [
        {
          id: "default",
          name: "全自动",
          command: fullAccessCommands[agent.key] ?? agent.instruction,
        },
      ],
      defaultId: "default",
    },
  ]),
);

/** Tasks hold a selection only; names, options and commands are derived on render. */
export interface TaskLaunchChoice {
  agentKey: string;
  groupId: string;
}
export function taskLaunchGroup(
  settings: { groups: Record<string, AgentGroups> },
  choice: TaskLaunchChoice,
) {
  const config = settings.groups[choice.agentKey];
  return config?.groups.find(
    (group) => group.id === (choice.groupId || config.defaultId),
  );
}
