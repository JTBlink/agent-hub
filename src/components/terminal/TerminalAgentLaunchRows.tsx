import { useEffect, useRef, useState, useId } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HerdrIcon } from "@app/herdr";
import { AgentIcon } from "../AgentIcon";
import type {
  HerdrAgent,
  TerminalLaunchBackend,
  installedTerminalAgents,
} from "../../lib/terminalAgents";
import type { AgentLaunchSchemes } from "../../lib/agentLaunchConfig";
import { TerminalLaunchSchemeMenu } from "./TerminalLaunchSchemeMenu";

export type AgentLaunchRow = ReturnType<
  typeof installedTerminalAgents
>[number] & { schemes: AgentLaunchSchemes };
export function TerminalAgentLaunchRows({
  rows,
  defaultAgent,
  disabled,
  herdrBusy,
  onNew,
  onHerdr,
  close,
}: {
  rows: AgentLaunchRow[];
  defaultAgent?: HerdrAgent;
  disabled: boolean;
  herdrBusy?: boolean;
  onNew: (agent?: HerdrAgent, schemeId?: string, schemeName?: string) => void;
  onHerdr?: (agent: HerdrAgent, schemeId?: string, schemeName?: string) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const submenuId = useId();
  const [panel, setPanel] = useState<{
    id: HerdrAgent;
    backend: TerminalLaunchBackend;
    anchor: HTMLElement;
    focus: boolean;
  } | null>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = () => {
    if (leave.current) clearTimeout(leave.current);
  };
  useEffect(
    () => () => {
      if (leave.current) clearTimeout(leave.current);
    },
    [],
  );
  const launch = (
    row: AgentLaunchRow,
    id: string,
    backend: TerminalLaunchBackend,
  ) => {
    if (disabled || (backend === "herdr" && herdrBusy)) return;
    close();
    const name =
      row.schemes.items.length > 1
        ? row.schemes.items.find((item) => item.id === id)?.name
        : undefined;
    if (backend === "herdr") onHerdr?.(row.id, id, ...(name ? [name] : []));
    else onNew(row.id, id, ...(name ? [name] : []));
  };
  const open = (
    row: AgentLaunchRow,
    backend: TerminalLaunchBackend,
    target: HTMLElement,
    focus: boolean,
    executeSingle: boolean,
  ) => {
    cancelLeave();
    if (disabled || (backend === "herdr" && herdrBusy)) return;
    if (row.schemes.items.length > 1)
      setPanel({ id: row.id, backend, anchor: target, focus });
    else {
      setPanel(null);
      if (executeSingle) launch(row, row.schemes.items[0].id, backend);
    }
  };
  const selected = rows.find((row) => row.id === panel?.id);
  if (!rows.length) return null;
  return (
    <div
      onMouseEnter={cancelLeave}
      onMouseLeave={() => {
        cancelLeave();
        leave.current = setTimeout(() => setPanel(null), 180);
      }}
      onKeyDownCapture={(event) => {
        if (panel && (event.key === "Escape" || event.key === "ArrowLeft")) {
          event.preventDefault();
          event.stopPropagation();
          setPanel(null);
          panel.anchor.focus();
        }
      }}
    >
      <div role="separator" className="my-1 border-t border-border-subtle" />
      {rows.map((row) => {
        const multiple = row.schemes.items.length > 1;
        return (
          <div key={row.id} className="relative flex items-center rounded-md">
            <button
              type="button"
              role="menuitem"
              aria-label={`${t("terminal.new")} ${row.label}`}
              aria-haspopup={multiple ? "menu" : undefined}
              aria-controls={
                multiple && panel?.id === row.id && panel.backend === "terminal"
                  ? submenuId
                  : undefined
              }
              aria-expanded={
                multiple
                  ? panel?.id === row.id && panel.backend === "terminal"
                  : undefined
              }
              disabled={disabled}
              className={`flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left text-sm text-secondary outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${panel?.id === row.id && panel.backend === "terminal" ? "bg-surface-active" : ""} ${onHerdr ? (multiple ? "pr-16" : "pr-11") : multiple ? "pr-7" : "pr-2"}`}
              onMouseEnter={(event) => {
                if (
                  panel?.id === row.id &&
                  panel.backend === "herdr" &&
                  event.clientX >=
                    panel.anchor.getBoundingClientRect().right - 1
                )
                  return;
                open(row, "terminal", event.currentTarget, false, false);
              }}
              onClick={(event) =>
                open(row, "terminal", event.currentTarget, true, true)
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" && multiple) {
                  event.preventDefault();
                  open(row, "terminal", event.currentTarget, true, false);
                }
              }}
            >
              <AgentIcon agentKey={row.toolKey} className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {defaultAgent === row.id && (
                <Check size={14} className="shrink-0 text-accent" />
              )}
              {multiple && (
                <>
                  <span className="shrink-0 text-xs text-muted">
                    {t("terminal.schemeCount", {
                      count: row.schemes.items.length,
                    })}
                  </span>
                  <ChevronRight
                    size={14}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                  />
                </>
              )}
            </button>
            {onHerdr && (
              <button
                type="button"
                role="menuitem"
                aria-label={`${t("terminal.openHerdr")} ${row.label}`}
                title={`${t("terminal.openHerdr")} ${row.label}`}
                aria-haspopup={multiple ? "menu" : undefined}
                aria-expanded={
                  multiple
                    ? panel?.id === row.id && panel.backend === "herdr"
                    : undefined
                }
                aria-controls={
                  multiple && panel?.id === row.id && panel.backend === "herdr"
                    ? submenuId
                    : undefined
                }
                disabled={disabled || herdrBusy}
                className={`app-button-ghost absolute top-1/2 h-8 w-8 -translate-y-1/2 p-0 text-muted outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${panel?.id === row.id && panel.backend === "herdr" ? "bg-surface-active text-accent" : ""} ${multiple ? "right-6" : "right-1"}`}
                onMouseEnter={(event) =>
                  open(row, "herdr", event.currentTarget, false, false)
                }
                onClick={(event) =>
                  open(row, "herdr", event.currentTarget, true, true)
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" && multiple) {
                    event.preventDefault();
                    open(row, "herdr", event.currentTarget, true, false);
                  }
                }}
              >
                <HerdrIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
      {panel && selected && (
        <TerminalLaunchSchemeMenu
          key={`${panel.id}-${panel.backend}`}
          id={submenuId}
          anchor={panel.anchor}
          allowHerdr={!!onHerdr}
          disabled={disabled}
          herdrDisabled={!!herdrBusy}
          label={selected.label}
          config={selected.schemes}
          focusFirst={panel.focus}
          onBack={() => {
            setPanel(null);
            panel.anchor.focus();
          }}
          onSelect={(id, backend) => launch(selected, id, backend)}
        />
      )}
    </div>
  );
}
