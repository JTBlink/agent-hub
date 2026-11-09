import { useState, type KeyboardEvent } from "react";
import {
  Globe,
  FileText,
  Search,
  Settings,
  Smartphone,
  TerminalSquare,
  Check,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  HerdrIcon,
  installedTerminalAgents,
  defaultTerminalAgent,
  type HerdrAgent,
} from "@app/herdr";
import { AgentIcon } from "../AgentIcon";
import type { CardAction } from "../CardActionMenu";
import type { ToolInfo } from "../../lib/tauri";
import { queuePreviewWeb } from "../../features/preview/shared/openRequests";
import { useDefaultAgentKey } from "../../hooks/useDefaultAgentKey";

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
  onNew: (agent?: HerdrAgent) => void;
  onNewMarkdown?: () => void;
  onHerdr?: (agent: HerdrAgent) => void;
  onHerdrSettings?: () => void;
  herdrBusy?: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const agents = installedTerminalAgents(tools);
  const defaultAgent = defaultTerminalAgent(agents, useDefaultAgentKey());
  const actions: CardAction[] = [
    {
      key: "terminal",
      label: t("terminal.new"),
      icon: <TerminalSquare size={16} />,
      disabled: terminalDisabled,
      onSelect: () => onNew(),
    },
    {
      key: "browser",
      label: t("terminal.newBrowser"),
      icon: <Globe size={16} />,
      onSelect: () => queuePreviewWeb("about:blank"),
    },
    ...(onNewMarkdown
      ? [
          {
            key: "markdown",
            label: t("terminal.newMarkdown"),
            icon: <FileText size={16} />,
            onSelect: onNewMarkdown,
          },
        ]
      : []),
    {
      key: "mobile",
      label: t("terminal.newMobile"),
      icon: <Smartphone size={16} />,
      onSelect: () =>
        queuePreviewWeb("about:blank", "default", {
          width: 390,
          height: 844,
          mobile: true,
        }),
    },
    ...agents.map(({ id, label, toolKey }, index) => ({
      key: id,
      label,
      separatorBefore: index === 0,
      checked: defaultAgent?.id === id,
      disabled: terminalDisabled,
      icon: (
        <AgentIcon
          agentKey={toolKey}
          className="h-5 w-5 border-0 bg-transparent"
        />
      ),
      onSelect: () => onNew(id),
    })),
    {
      key: "settings",
      label: t("terminal.agentSettings"),
      icon: <Settings size={16} />,
      separatorBefore: true,
      onSelect: () => navigate("/settings#agents"),
    },
    ...(onHerdrSettings
      ? [
          {
            key: "herdr-settings",
            label: t("terminal.herdrAgentSettings"),
            icon: <HerdrIcon width={16} height={16} viewBox="0 0 32 32" />,
            onSelect: onHerdrSettings,
          },
        ]
      : []),
  ];
  const filtered = actions.filter((action) =>
    action.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
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
    ];
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
    <div className="w-72 max-w-full" onKeyDown={onKeyDown}>
      <label className="m-1 mb-2 flex items-center gap-2 border-b border-border-subtle px-2 pb-2 text-muted">
        <Search size={14} className="shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("terminal.searchNew")}
          placeholder={t("terminal.searchNew")}
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-primary outline-none"
        />
      </label>
      <div role="menu" aria-label={t("terminal.newMenu")}>
        {filtered.map((action) => (
          <div key={action.key}>
            {action.separatorBefore && !query.trim() && (
              <div
                role="separator"
                className="my-1 border-t border-border-subtle"
              />
            )}
            <div className="group/agent flex items-center gap-1 rounded-md hover:bg-surface-hover focus-within:bg-surface-hover">
              <button
                type="button"
                role={
                  action.checked === undefined ? "menuitem" : "menuitemradio"
                }
                aria-checked={action.checked}
                disabled={action.disabled}
                onClick={() => {
                  close();
                  action.onSelect();
                }}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${action.checked ? "text-accent" : "text-secondary"}`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.checked && (
                  <Check
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
              {onHerdr && agents.some((agent) => agent.id === action.key) && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`${t("terminal.openHerdr")} ${action.label}`}
                  title={`${t("terminal.openHerdr")} ${action.label}`}
                  disabled={action.disabled || herdrBusy}
                  className="app-button-ghost pointer-events-none mr-1 h-7 w-7 shrink-0 p-0 text-muted opacity-0 transition-opacity group-hover/agent:pointer-events-auto group-hover/agent:opacity-70 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-70"
                  onClick={() => {
                    close();
                    onHerdr(action.key as HerdrAgent);
                  }}
                >
                  <HerdrIcon
                    width={16}
                    height={16}
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          </div>
        ))}
        {!filtered.length && (
          <p role="status" className="px-3 py-4 text-xs text-muted">
            {t("terminal.noNewMatches")}
          </p>
        )}
      </div>
    </div>
  );
}
