import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentSelect } from "../../../components/AgentSelect";
import { GitBrowserDialog } from "../../../components/GitBrowserDialog";
import {
  installedTerminalAgents,
  type HerdrAgent,
} from "../../../lib/terminalAgents";
import type { ToolInfo } from "../../../lib/tauri";

export function HerdrLaunchDialog({
  tools,
  busy,
  error,
  onLaunch,
  onClose,
}: {
  tools: readonly ToolInfo[];
  busy: boolean;
  error: string;
  onLaunch: (agent?: HerdrAgent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const agents = installedTerminalAgents(tools);
  return (
    <GitBrowserDialog
      title={t("terminal.openHerdr")}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onLaunch(agents.find((agent) => agent.id === selected)?.id);
        }}
      >
        <p className="text-xs leading-relaxed text-muted">
          {t("herdr.launchProjectAgent")}
        </p>
        <AgentSelect
          label={t("preview.selectAgent")}
          agents={agents}
          value={selected}
          onChange={setSelected}
          disabled={busy}
          automaticLabel={t("preview.autoAgent")}
        />
        {error && (
          <p role="alert" className="break-words text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="app-button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="app-button-primary"
            disabled={busy || !agents.length}
          >
            {t("terminal.openHerdr")}
          </button>
        </div>
      </form>
    </GitBrowserDialog>
  );
}
