import { useState, type KeyboardEvent } from "react";
import {
  Globe,
  FileText,
  Search,
  Settings,
  Smartphone,
  TerminalSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  HerdrIcon,
  installedTerminalAgents,
  defaultTerminalAgent,
  type HerdrAgent,
} from "@app/herdr";
import type { CardAction } from "../CardActionMenu";
import { CardActionMenuItems } from "../CardActionMenuItems";
import type { ToolInfo } from "../../lib/tauri";
import { queuePreviewWeb } from "../../features/preview/shared/openRequests";
import { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import { agentLaunchSchemes } from "../../lib/agentLaunchConfig";
import { TerminalAgentLaunchRows } from "./TerminalAgentLaunchRows";

export function TerminalNewMenuContent({
  tools,
  terminalDisabled,
  onNew,
  onNewMarkdown,
  onHerdr,
  onHerdrSettings,
  herdrBusy,
  close,
}: {
  tools: readonly Pick<ToolInfo, "key" | "installed">[];
  terminalDisabled: boolean;
  onNew: (agent?: HerdrAgent, schemeId?: string, schemeName?: string) => void;
  onNewMarkdown?: () => void;
  onHerdr?: (agent: HerdrAgent, schemeId?: string, schemeName?: string) => void;
  onHerdrSettings?: () => void;
  herdrBusy?: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const launch = useAgentLaunchSettings();
  const [query, setQuery] = useState("");
  const agents = installedTerminalAgents(tools);
  const defaultAgent = defaultTerminalAgent(
    agents,
    launch.snapshot?.document.default_agent ?? "codex",
  );
  const needle = query.trim().toLocaleLowerCase();
  const select = (action: () => void) => () => {
    close();
    action();
  };
  const actions: CardAction[] = [
    {
      key: "terminal",
      label: t("terminal.new"),
      icon: <TerminalSquare size={16} />,
      disabled: terminalDisabled,
      onSelect: select(() => onNew()),
    },
    {
      key: "browser",
      label: t("terminal.newBrowser"),
      icon: <Globe size={16} />,
      onSelect: select(() => queuePreviewWeb("about:blank")),
    },
    ...(onNewMarkdown
      ? [
          {
            key: "markdown",
            label: t("terminal.newMarkdown"),
            icon: <FileText size={16} />,
            onSelect: select(onNewMarkdown),
          },
        ]
      : []),
    {
      key: "mobile",
      label: t("terminal.newMobile"),
      icon: <Smartphone size={16} />,
      onSelect: select(() =>
        queuePreviewWeb("about:blank", "default", {
          width: 390,
          height: 844,
          mobile: true,
        }),
      ),
    },
  ];
  const filtered = actions.filter((action) =>
    action.label.toLocaleLowerCase().includes(needle),
  );
  const snapshot = launch.snapshot;
  const rows = snapshot
    ? agents
        .map((agent) => ({
          ...agent,
          schemes: agentLaunchSchemes(
            snapshot,
            agent.toolKey,
            t("agentLaunch.schemes.automatic"),
          ),
        }))
        .filter((row) =>
          `${row.label} ${row.schemes.items.map((scheme) => `${scheme.name} ${scheme.instruction}`).join(" ")}`
            .toLocaleLowerCase()
            .includes(needle),
        )
    : [];
  const footer: CardAction[] = [
    {
      key: "settings",
      label: t("terminal.agentSettings"),
      icon: <Settings size={16} />,
      separatorBefore: true,
      onSelect: select(() => navigate("/settings#agents")),
    },
    ...(onHerdrSettings
      ? [
          {
            key: "herdr-settings",
            label: t("terminal.herdrSettings"),
            icon: <HerdrIcon width={16} height={16} viewBox="0 0 32 32" />,
            onSelect: select(onHerdrSettings),
          },
        ]
      : []),
  ].filter(
    (action) => !needle || action.label.toLocaleLowerCase().includes(needle),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close();
      return;
    }
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled), button[role="menuitemradio"]:not(:disabled)',
      ),
    ].filter(
      (button) =>
        button.closest('[role="menu"]') ===
        event.currentTarget.querySelector('[role="menu"]'),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const input = event.target instanceof HTMLInputElement;
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % buttons.length
        : event.key === "ArrowUp"
          ? index < 0
            ? buttons.length - 1
            : (index - 1 + buttons.length) % buttons.length
          : !input && event.key === "Home"
            ? 0
            : !input && event.key === "End"
              ? buttons.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      buttons[next]?.focus();
    }
    if (input && event.key === "Enter") {
      event.preventDefault();
      buttons[0]?.click();
    }
  };
  return (
    <div className="w-80 max-w-full" onKeyDown={onKeyDown}>
      <label className="m-1 mb-2 flex items-center gap-2 border-b border-border-subtle px-2 pb-2 text-muted">
        <Search size={14} className="shrink-0" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("terminal.searchNew")}
          placeholder={t("terminal.searchNew")}
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-primary outline-none"
        />
      </label>
      <div role="menu" aria-label={t("terminal.newMenu")}>
        <CardActionMenuItems actions={filtered} close={close} />
        <TerminalAgentLaunchRows
          rows={rows}
          defaultAgent={defaultAgent?.id}
          disabled={terminalDisabled}
          herdrBusy={herdrBusy}
          onNew={onNew}
          onHerdr={onHerdr}
          close={close}
        />
        {!launch.snapshot && agents.length > 0 && (
          <p
            role={launch.error ? "alert" : "status"}
            className="px-3 py-2 text-xs text-muted"
          >
            {launch.error || t("common.loading")}
          </p>
        )}
        {!filtered.length && !rows.length && !footer.length && (
          <p role="status" className="px-3 py-4 text-xs text-muted">
            {t("terminal.noNewMatches")}
          </p>
        )}
        <CardActionMenuItems actions={footer} close={close} />
      </div>
    </div>
  );
}
