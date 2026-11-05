import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { AgentIcon } from "../../../components/AgentIcon";
import type {
  AgentDeliveryAdapter,
  AgentDeliveryChoice,
} from "../../../lib/agentDelivery";
import { previewError } from "../shared/previewError";

export function DeliveryAgentSelect({
  adapter,
  value,
  disabled,
  onChange,
}: {
  adapter: AgentDeliveryAdapter;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<{
    agents: AgentDeliveryChoice[];
    error?: unknown;
  }>({ agents: [] });
  useEffect(() => {
    let disposed = false;
    void adapter.listAgents?.().then(
      (agents) => {
        if (!disposed) setState({ agents });
      },
      (error: unknown) => {
        if (!disposed) setState({ agents: [], error });
      },
    );
    return () => {
      disposed = true;
    };
  }, [adapter]);
  if (!adapter.listAgents) return null;
  const icon = (id: string) => {
    const agent = state.agents.find((item) => item.id === id);
    return agent ? (
      <AgentIcon agentKey={agent.toolKey} className="h-4 w-4" />
    ) : undefined;
  };
  return (
    <div className="preview-delivery-agent">
      <ThemedSelect
        aria-label={t("preview.selectAgent")}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        leadingIcon={icon(value)}
        optionIcon={icon}
        fitContent
      >
        <option value="">{t("preview.autoAgent")}</option>
        {value && !state.agents.some((agent) => agent.id === value) && (
          <option value={value} disabled>
            {value}
          </option>
        )}
        {state.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.label}
          </option>
        ))}
      </ThemedSelect>
      {state.error ? <p role="alert">{previewError(state.error, t)}</p> : null}
    </div>
  );
}
