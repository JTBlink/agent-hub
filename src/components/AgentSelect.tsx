import { AgentIcon } from "./AgentIcon";
import { ThemedSelect } from "./ThemedSelect";
import type { ReactNode } from "react";

export interface AgentSelectChoice {
  id: string;
  label: string;
  toolKey: string;
  disabled?: boolean;
}
/** One icon/label/selection surface for preview delivery and Agent launch settings. */
export function AgentSelect({
  agents,
  value,
  onChange,
  label,
  automaticLabel,
  disabled,
  className,
  leadingIcon,
  title,
  menuTitle,
}: {
  agents: readonly AgentSelectChoice[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  automaticLabel?: string;
  disabled?: boolean;
  className?: string;
  leadingIcon?: ReactNode;
  title?: string;
  menuTitle?: string;
}) {
  const icon = (id: string) => {
    const agent = agents.find((item) => item.id === id);
    return agent ? (
      <AgentIcon
        agentKey={agent.toolKey}
        className="h-4 w-4 shrink-0 border-0 bg-transparent"
      />
    ) : undefined;
  };
  return (
    <ThemedSelect
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={className}
      leadingIcon={leadingIcon ?? icon(value)}
      title={title}
      menuTitle={menuTitle}
      optionIcon={icon}
      fitContent
    >
      {automaticLabel && <option value="">{automaticLabel}</option>}
      {value && !agents.some((agent) => agent.id === value) && (
        <option value={value} disabled>
          {value}
        </option>
      )}
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id} disabled={agent.disabled}>
          {agent.label}
        </option>
      ))}
    </ThemedSelect>
  );
}
