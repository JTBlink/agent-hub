import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  Globe,
  Search,
  Settings,
  Smartphone,
  TerminalSquare,
} from "lucide-react";
import { AgentIcon } from "../../../src/components/AgentIcon";
import type { CardMenuAction } from "../../../src/components/CardActionMenu";
import { CardActionMenuItems } from "../../../src/components/CardActionMenuItems";
import { navigateMenu } from "../../../src/lib/menuNavigation";
import { HerdrIcon } from "../../../src/features/herdr/components/HerdrIcon";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";
import type { TaskLaunchChoice } from "./launchGroups";
import { LaunchSchemeSubmenu } from "./LaunchSchemeSubmenu";

export type LaunchBackend = "terminal" | "herdr";
export function NewMenu({
  settings,
  onLaunch,
  onBasic,
  onSettings,
  onHerdrSettings,
  close,
}: {
  settings: LaunchSettingsPrototype;
  onLaunch: (
    choice: TaskLaunchChoice,
    backend: LaunchBackend,
    label: string,
  ) => void;
  onBasic: (label: string) => void;
  onSettings: () => void;
  onHerdrSettings: () => void;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  };
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );
  const [panel, setPanel] = useState<{
    entryKey: string;
    backend: LaunchBackend;
    anchor: HTMLElement | null;
    focusFirst: boolean;
  } | null>(null);
  const needle = query.trim().toLowerCase();
  const select = (action: () => void) => () => {
    close();
    action();
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close();
      return;
    }
    const menu =
      event.currentTarget.querySelector<HTMLElement>('[role="menu"]');
    if (
      event.target instanceof HTMLInputElement &&
      !["ArrowDown", "ArrowUp"].includes(event.key)
    )
      return;
    if (menu && navigateMenu(menu, event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const basic: CardMenuAction[] = [
    {
      key: "terminal",
      label: "新建终端",
      icon: <TerminalSquare size={17} />,
      onSelect: select(() => onBasic("终端")),
    },
    {
      key: "browser",
      label: "新建浏览器标签",
      icon: <Globe size={17} />,
      onSelect: select(() => onBasic("浏览器")),
    },
    {
      key: "markdown",
      label: "新建 Markdown",
      icon: <FileText size={17} />,
      onSelect: select(() => onBasic("Markdown")),
    },
    {
      key: "mobile",
      label: "新建手机预览",
      icon: <Smartphone size={17} />,
      onSelect: select(() => onBasic("手机预览")),
    },
  ].filter((item) => item.label.toLowerCase().includes(needle));
  const entries = settings.agents
    .filter((agent) => agent.installed && agent.enabled)
    .flatMap((agent) => [
      { key: agent.key, label: agent.display_name, toolKey: agent.key },
      ...(agent.key === "claude_code"
        ? [
            {
              key: "claude-teams",
              label: "Claude Agent Teams",
              toolKey: "claude_code",
            },
          ]
        : []),
    ]);
  const rows = entries.filter((entry) =>
    settings.groups[entry.toolKey].groups.some((group) =>
      `${entry.label} ${group.name} ${group.command}`
        .toLowerCase()
        .includes(needle),
    ),
  );
  const open = (
    entry: (typeof entries)[number],
    backend: LaunchBackend,
    target?: HTMLElement,
    focus = true,
  ) => {
    cancelLeave();
    const config = settings.groups[entry.toolKey];
    if (config.groups.length > 1)
      setPanel({
        entryKey: entry.key,
        backend,
        anchor: target ?? panel?.anchor ?? null,
        focusFirst: focus,
      });
    else if (config.groups[0].command.trim())
      select(() =>
        onLaunch(
          { agentKey: entry.toolKey, groupId: config.groups[0].id },
          backend,
          entry.label,
        ),
      )();
  };
  const panelEntry =
    panel && entries.find((entry) => entry.key === panel.entryKey);
  const panelGroups = panelEntry
    ? settings.groups[panelEntry.toolKey]
    : undefined;
  return (
    <div
      className="w-80 max-w-full"
      onKeyDown={keyboard}
      onMouseEnter={cancelLeave}
      onMouseLeave={() => {
        cancelLeave();
        leaveTimer.current = setTimeout(() => setPanel(null), 180);
      }}
      onKeyDownCapture={(event) => {
        if (panel && (event.key === "Escape" || event.key === "ArrowLeft")) {
          event.preventDefault();
          event.stopPropagation();
          setPanel(null);
          panel?.anchor?.focus();
        }
      }}
    >
      <label
        onMouseEnter={() => setPanel(null)}
        className="m-1 mb-2 flex items-center gap-2 border-b border-border-subtle px-2 pb-2 text-muted"
      >
        <Search size={14} />
        <input
          autoFocus
          type="search"
          aria-label="搜索新建操作或 Agent"
          placeholder="搜索新建操作或 Agent"
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div role="menu" aria-label="新建标签菜单">
        <div onMouseEnter={() => setPanel(null)}>
          <CardActionMenuItems actions={basic} close={close} />
        </div>
        {rows.length > 0 && basic.length > 0 && (
          <div
            role="separator"
            className="my-1 border-t border-border-subtle"
          />
        )}
        {rows.map((entry) => {
          const config = settings.groups[entry.toolKey];
          const multiple = config.groups.length > 1;
          const disabled = !config.groups.some((group) => group.command.trim());
          return (
            <div
              key={entry.key}
              className="relative flex items-center rounded-md"
            >
              <button
                type="button"
                role="menuitem"
                aria-label={`在内嵌终端启动 ${entry.label}`}
                title={entry.label}
                aria-haspopup={multiple ? "menu" : undefined}
                disabled={disabled}
                className={`flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md pl-2 py-1.5 text-left text-sm text-secondary outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${multiple ? "pr-16" : "pr-11"}`}
                onMouseEnter={(event) => {
                  if (multiple) {
                    if (
                      panel?.entryKey === entry.key &&
                      panel.backend === "herdr" &&
                      event.clientX >=
                        (panel.anchor?.getBoundingClientRect().right ?? 0) - 1
                    )
                      return;
                    open(entry, "terminal", event.currentTarget, false);
                  } else setPanel(null);
                }}
                onClick={(event) =>
                  open(entry, "terminal", event.currentTarget)
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" && multiple) {
                    event.preventDefault();
                    open(entry, "terminal", event.currentTarget);
                  }
                }}
              >
                <AgentIcon
                  agentKey={entry.toolKey}
                  className="h-5 w-5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {settings.defaultAgent === entry.toolKey &&
                  entry.key !== "claude-teams" && (
                    <Check size={14} className="shrink-0 text-accent" />
                  )}
                {multiple && (
                  <>
                    <span className="shrink-0 text-xs text-muted">
                      {config.groups.length} 套
                    </span>
                    <ChevronRight
                      size={14}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                    />
                  </>
                )}
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label={`通过 Herdr 启动 ${entry.label}`}
                title={`通过 Herdr 启动 ${entry.label}`}
                aria-haspopup={multiple ? "menu" : undefined}
                disabled={disabled}
                className={`app-button-ghost absolute top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-muted hover:text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent ${multiple ? "right-6" : "right-1"}`}
                onMouseEnter={(event) => {
                  if (multiple)
                    open(entry, "herdr", event.currentTarget, false);
                  else setPanel(null);
                }}
                onClick={(event) => open(entry, "herdr", event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" && multiple) {
                    event.preventDefault();
                    open(entry, "herdr", event.currentTarget);
                  }
                }}
              >
                <HerdrIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {!rows.length && !basic.length && (
          <p role="status" className="px-3 py-3 text-xs text-muted">
            没有匹配的操作或方案
          </p>
        )}
        <CardActionMenuItems
          actions={[
            {
              key: "settings",
              label: "智能体设置…",
              separatorBefore: true,
              icon: <Settings size={17} />,
              onSelect: select(onSettings),
            },
            {
              key: "herdr-settings",
              label: "Herdr 设置…",
              icon: <HerdrIcon className="h-4 w-4" />,
              onSelect: select(onHerdrSettings),
            },
          ]}
          close={close}
        />
      </div>
      {panel && panelEntry && panelGroups && (
        <LaunchSchemeSubmenu
          key={`${panel.entryKey}-${panel.backend}`}
          anchor={panel.anchor}
          label={panelEntry.label}
          config={panelGroups}
          focusFirst={panel.focusFirst}
          onBack={() => {
            setPanel(null);
            panel?.anchor?.focus();
          }}
          onSelect={(id, selectedBackend) =>
            select(() =>
              onLaunch(
                { agentKey: panelEntry.toolKey, groupId: id },
                selectedBackend,
                panelEntry.label,
              ),
            )()
          }
        />
      )}
    </div>
  );
}
