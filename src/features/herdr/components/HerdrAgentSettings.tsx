import { AgentSelect } from "../../../components/AgentSelect";
import { useTranslation } from "react-i18next";
import { useApp } from "../../../context/AppContext";
import { useAgentLaunchSettings } from "../../../hooks/useAgentLaunchSettings";
import { AgentLaunchEditor } from "../../../components/settings/AgentLaunchEditor";
import { herdrAgents } from "../../../lib/terminalAgents";

/** Shares the portable launch document with Settings and every Herdr launch path. */
export function HerdrAgentSettings() {
  const { t } = useTranslation();
  const { tools } = useApp();
  const controller = useAgentLaunchSettings();
  const { snapshot, busy, error, save, reload } = controller;
  const agents = herdrAgents;
  const defaultAgent = agents.find(
    (agent) =>
      agent.toolKey === snapshot?.document.default_agent ||
      agent.id === snapshot?.document.default_agent,
  );
  const agentKey = defaultAgent?.toolKey || "codex";
  return (
    <section
      className="mt-5 space-y-3 border-t border-border-subtle pt-4"
      aria-label={t("herdr.agentLaunch")}
    >
      <h3 className="text-xs font-medium text-primary">
        {t("herdr.agentLaunch")}
      </h3>
      <p className="text-xs leading-relaxed text-muted">
        {t("herdr.agentLaunchHelp")}
      </p>
      {error && (
        <div role="alert" className="text-xs text-danger">
          <p>{error}</p>
          <button
            type="button"
            className="app-button-ghost mt-1"
            disabled={busy}
            onClick={() => void reload()}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      <label className="block text-xs text-secondary">
        {t("herdr.defaultAgent")}
        <AgentSelect
          label={t("herdr.defaultAgent")}
          value={snapshot?.document.default_agent ?? ""}
          disabled={!snapshot || busy}
          agents={agents.map((agent) => ({
            ...agent,
            id: agent.id === "claude" ? "claude_code" : agent.id,
            disabled: !tools.some(
              (tool) => tool.key === agent.toolKey && tool.installed,
            ),
          }))}
          automaticLabel={t("herdr.selectAgent")}
          onChange={(value) =>
            void save((current) => ({ ...current, default_agent: value }))
          }
          className="mt-1 w-full"
        />
      </label>
      <AgentLaunchEditor
        key={agentKey}
        agentKey={agentKey}
        controller={controller}
      />
    </section>
  );
}
