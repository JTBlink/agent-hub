import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import type { ToolInfo } from "../../lib/tauri";
import { GlobalDefaultSchemeField } from "./GlobalDefaultSchemeField";
import { ThemedSelect } from "../ThemedSelect";

/** Edits the shared default without copying launch schemes into scene settings. */
export function GlobalDefaultAgentField({
  tools,
  controller,
}: {
  tools: readonly Pick<ToolInfo, "key" | "display_name" | "installed">[];
  controller: ReturnType<typeof useAgentLaunchSettings>;
}) {
  const { t } = useTranslation();
  const helpId = useId();
  const { snapshot, busy, error, save, reload } = controller;
  const selected = snapshot?.document.default_agent ?? "";
  const choices = tools.filter((tool) => tool.installed);
  return (
    <div className="space-y-2">
      <label className="block space-y-2">
        <span className="text-xs font-medium text-primary">
          {t("agentLaunch.globalDefault")}
        </span>
        <ThemedSelect
          className="app-input w-full"
          aria-label={t("agentLaunch.globalDefault")}
          aria-describedby={helpId}
          value={selected}
          disabled={!snapshot || busy}
          onChange={(event) => {
            const key = event.target.value;
            if (key === selected) return;
            void save((current) => ({ ...current, default_agent: key }));
          }}
        >
          {!snapshot && <option value="">{t("common.loading")}</option>}
          {selected && !choices.some((tool) => tool.key === selected) && (
            <option value={selected}>
              {tools.find((tool) => tool.key === selected)?.display_name ??
                selected}
            </option>
          )}
          {choices.map((tool) => (
            <option key={tool.key} value={tool.key}>
              {tool.display_name}
            </option>
          ))}
        </ThemedSelect>
      </label>
      <p id={helpId} className="text-xs leading-relaxed text-muted">
        {t("agentLaunch.globalDefaultHelp")}
      </p>
      <GlobalDefaultSchemeField controller={controller} />
      {busy && (
        <p role="status" className="text-xs text-muted">
          {t("common.loading")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}{" "}
          <button
            type="button"
            className="text-accent"
            onClick={() => void reload()}
          >
            {t("common.retry")}
          </button>
        </p>
      )}
    </div>
  );
}
