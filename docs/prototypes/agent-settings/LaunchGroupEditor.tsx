import type { ReactNode } from "react";
import { AgentLaunchSchemesEditor } from "../../../src/components/settings/AgentLaunchSchemesEditor";
import { initialGroups, type AgentGroups } from "./launchGroups";

export function LaunchGroupEditor({
  agentKey,
  name,
  value,
  onChange,
  actions,
}: {
  agentKey: string;
  name: string;
  value: AgentGroups;
  onChange: (next: AgentGroups) => void;
  actions: ReactNode;
}) {
  return (
    <AgentLaunchSchemesEditor
      agentKey={agentKey}
      name={name}
      defaultInstruction={
        initialGroups[agentKey]?.groups[0].command ?? agentKey
      }
      value={{
        default_id: value.defaultId,
        items: value.groups.map(({ command, ...group }) => ({
          ...group,
          instruction: command,
        })),
      }}
      onChange={(next) =>
        onChange({
          defaultId: next.default_id,
          groups: next.items.map(({ instruction, ...group }) => ({
            ...group,
            command: instruction,
          })),
        })
      }
      actions={actions}
    />
  );
}
