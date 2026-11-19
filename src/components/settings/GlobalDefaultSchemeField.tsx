import { Settings } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import {
  agentLaunchSchemes,
  withAgentLaunchSchemes,
} from "../../lib/agentLaunchConfig";
import { ThemedSelect } from "../ThemedSelect";

/** Select a shared default scheme; command editing stays in Agent settings. */
export function GlobalDefaultSchemeField({
  controller,
}: {
  controller: ReturnType<typeof useAgentLaunchSettings>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const helpId = useId();
  const { snapshot, busy, save } = controller;
  if (!snapshot) return null;
  const agent = snapshot.document.default_agent;
  const schemes = agentLaunchSchemes(
    snapshot,
    agent,
    t("agentLaunch.schemes.automatic"),
  );
  const selected = schemes.items.find(
    (scheme) => scheme.id === schemes.default_id,
  );
  return (
    <div className="space-y-2 pt-2">
      <label className="block space-y-2">
        <span className="text-xs font-medium text-primary">
          {t("agentLaunch.globalDefaultScheme")}
        </span>
        <ThemedSelect
          className="app-input w-full"
          aria-label={t("agentLaunch.globalDefaultScheme")}
          aria-describedby={helpId}
          value={schemes.default_id}
          disabled={busy}
          onChange={(event) => {
            const id = event.target.value;
            if (id === schemes.default_id) return;
            void save((current) => {
              const latest = agentLaunchSchemes(
                { ...snapshot, document: current },
                agent,
              );
              if (
                current.default_agent !== agent ||
                !latest.items.some((scheme) => scheme.id === id)
              )
                throw new Error(t("agentLaunch.changed"));
              return withAgentLaunchSchemes(current, agent, {
                ...latest,
                default_id: id,
              });
            });
          }}
          menuFooterAction={{
            label: t("agentLaunch.schemes.manage"),
            icon: <Settings size={16} />,
            onSelect: () =>
              navigate(`/settings?agent=${encodeURIComponent(agent)}#agents`),
          }}
        >
          {schemes.items.map((scheme) => (
            <option key={scheme.id} value={scheme.id}>
              {scheme.name}
            </option>
          ))}
        </ThemedSelect>
      </label>
      {selected && (
        <code className="block break-all whitespace-pre-wrap rounded border border-border-subtle bg-surface p-2 text-xs text-secondary">
          {selected.instruction}
        </code>
      )}
      <p id={helpId} className="text-xs leading-relaxed text-muted">
        {t("agentLaunch.globalDefaultSchemeHelp")}
      </p>
    </div>
  );
}
