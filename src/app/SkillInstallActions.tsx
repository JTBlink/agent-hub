import type {
  ConfigScope,
  InstalledSkill,
  SkillInstallPlanPreview,
  WorkspaceRecord,
} from "../lib/backend";
import { useLanguage } from "../lib/i18n";

type AgentOption = {
  id: InstalledSkill["agent"];
  name: string;
  mark?: string;
};

export function SkillInstallTargetSelector({
  agents,
  selectedAgents,
  onAgentsChange,
  scope,
  onScopeChange,
  workspaceId,
  onWorkspaceChange,
  workspaces,
  lockedAgents = new Set(),
}: {
  agents: AgentOption[];
  selectedAgents: Set<InstalledSkill["agent"]>;
  onAgentsChange: (agents: Set<InstalledSkill["agent"]>) => void;
  scope: ConfigScope;
  onScopeChange: (scope: ConfigScope) => void;
  workspaceId: number | "";
  onWorkspaceChange: (workspaceId: number | "") => void;
  workspaces: WorkspaceRecord[];
  lockedAgents?: Set<InstalledSkill["agent"]>;
}) {
  const { t } = useLanguage();
  return (
    <div className="skill-install-target install-target-first">
      <fieldset className="agent-install-choice">
        <legend>{t("agentsToInstall")}</legend>
        <div className="agent-install-options">
          {agents.map((agent) => (
            <label
              className={selectedAgents.has(agent.id) ? "selected" : ""}
              key={agent.id}
            >
              <input
                type="checkbox"
                checked={
                  selectedAgents.has(agent.id) || lockedAgents.has(agent.id)
                }
                disabled={lockedAgents.has(agent.id)}
                onChange={() => {
                  const next = new Set(selectedAgents);
                  if (next.has(agent.id)) next.delete(agent.id);
                  else next.add(agent.id);
                  onAgentsChange(next);
                }}
              />
              <span className="agent-install-mark" aria-hidden="true">
                {agent.mark ?? agent.name.slice(0, 1)}
              </span>
              <span className="agent-install-name">
                {agent.name}
                {lockedAgents.has(agent.id) && <small>{t("required")}</small>}
              </span>
              <span className="agent-install-check" aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        {t("installationScope")}
        <select
          value={scope}
          onChange={(event) => onScopeChange(event.target.value as ConfigScope)}
        >
          <option value="global">{t("global")}</option>
          <option value="workspace">{t("workspace")}</option>
        </select>
      </label>
      {scope === "workspace" && (
        <label>
          工作空间
          <select
            value={workspaceId}
            onChange={(event) =>
              onWorkspaceChange(
                event.target.value ? Number(event.target.value) : "",
              )
            }
          >
            <option value="">{t("workspaceSelect")}</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function SkillInstallationSummary({
  plans,
  agentName,
  overwriteAgents,
  linkedAgents = [],
}: {
  plans: SkillInstallPlanPreview[];
  agentName: (agent: InstalledSkill["agent"]) => string;
  overwriteAgents: string[];
  linkedAgents?: InstalledSkill["agent"][];
}) {
  const { t } = useLanguage();
  const first = plans[0];
  if (!first) return null;
  return (
    <div className="skill-install-summary">
      <code>{first.plan.targetDirectory}</code>
      <span>
        {t("universal")}:{" "}
        {plans.map((item) => agentName(item.plan.agent)).join(", ")}
      </span>
      <span>
        {t("scope")}:{" "}
        {first.plan.scope === "global" ? t("global") : t("workspace")}
      </span>
      {first.plan.scope === "global" && linkedAgents.length > 0 && (
        <span>
          {t("symlink")} {linkedAgents.map(agentName).join(", ")}
        </span>
      )}
      {overwriteAgents.length > 0 && (
        <span>
          {t("overwrites")}: {overwriteAgents.join(", ")}
        </span>
      )}
    </div>
  );
}
