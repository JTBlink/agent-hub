import type { InstalledSkill } from "../lib/backend";
import { DropdownMenu } from "./DropdownMenu";

export type AgentSkillOption = {
  id: InstalledSkill["agent"];
  name: string;
  tone: string;
  mark: string;
  count: number;
};

export function AgentSkillSwitcher({
  options,
  selectedAgent,
  onChange,
}: {
  options: AgentSkillOption[];
  selectedAgent: InstalledSkill["agent"];
  onChange: (agent: InstalledSkill["agent"]) => void;
}) {
  if (!options.length) return null;

  return (
    <div className="skill-agent-switcher">
      <span className="skill-agent-switcher-kicker">Agent Skills</span>
      <DropdownMenu
        className="agent-dropdown"
        options={options.map((option) => ({
          value: option.id,
          label: option.name,
          description: `${option.count} 个 Skill`,
          meta: `${option.count} 个 Skill`,
          leading: (
            <span className={`agent-avatar small ${option.tone}`}>
              {option.mark}
            </span>
          ),
        }))}
        value={selectedAgent}
        onChange={(value) => onChange(value as InstalledSkill["agent"])}
        ariaLabel="选择 Agent"
        triggerCaption="选择 Agent"
        menuHeading="切换 Agent"
        menuCount={`${options.length} 个可用`}
      />
    </div>
  );
}
