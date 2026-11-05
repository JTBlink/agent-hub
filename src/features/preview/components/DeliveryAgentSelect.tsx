import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentSelect } from "../../../components/AgentSelect";
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
  return (
    <div className="preview-delivery-agent">
      <AgentSelect
        label={t("preview.selectAgent")}
        agents={state.agents}
        value={value}
        disabled={disabled}
        onChange={onChange}
        automaticLabel={t("preview.autoAgent")}
      />
      {state.error ? <p role="alert">{previewError(state.error, t)}</p> : null}
    </div>
  );
}
