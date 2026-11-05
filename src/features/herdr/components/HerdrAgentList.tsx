import { Fragment } from "react";
import {
  ChevronDown,
  ChevronRight,
  Send,
  FileText,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { cn } from "../../../utils";
import { navigateHerdrList } from "./herdrListNavigation";
import { HerdrStatus } from "./HerdrStatus";
import type { HerdrDialogRequest } from "./HerdrAgentDialog";

const button =
  "app-button-ghost rounded p-1 focus-visible:ring-2 focus-visible:ring-accent";

export function HerdrAgentList({
  agents,
  workspaces,
  selectedPaneId,
  agentsOpen,
  grouped,
  busy,
  onToggle,
  onToggleGrouping,
  open,
  request,
}: {
  agents: api.HerdrPane[];
  workspaces: api.HerdrWorkspace[];
  selectedPaneId?: string;
  agentsOpen: boolean;
  grouped: boolean;
  busy: boolean;
  onToggle: () => void;
  onToggleGrouping: () => void;
  open: (workspaceId: string, paneId: string) => void;
  request: (mode: HerdrDialogRequest["mode"], pane: api.HerdrPane) => void;
}) {
  const { t } = useTranslation();
  const group = (agent: api.HerdrPane) =>
    grouped
      ? t(`herdr.states.${api.herdrState(agent.agent_status)}`)
      : (workspaces.find((w) => w.workspace_id === agent.workspace_id)?.label ??
        agent.workspace_id);
  const order = ["blocked", "done", "working", "idle", "unknown"];
  const sorted = [...agents].sort((a, b) =>
    grouped
      ? order.indexOf(api.herdrState(a.agent_status)) -
        order.indexOf(api.herdrState(b.agent_status))
      : group(a).localeCompare(group(b)),
  );

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col",
        agentsOpen ? "flex-1" : "shrink-0",
      )}
      aria-label={t("herdr.agents")}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 px-3 text-xs">
        <button
          className="flex min-w-0 flex-1 items-center gap-1"
          aria-expanded={agentsOpen}
          onClick={() => onToggle()}
        >
          {agentsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <strong className="font-medium">{t("herdr.agents")}</strong>
          <span className="text-muted">{agents.length}</span>
        </button>
        <button
          className="app-button-ghost px-1 text-muted"
          onClick={() => onToggleGrouping()}
        >
          {t(grouped ? "herdr.byState" : "herdr.byWorkspace")}
        </button>
      </div>
      <div
        hidden={!agentsOpen}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          !agentsOpen && "hidden",
        )}
        onKeyDown={navigateHerdrList}
      >
        {sorted.map((a, index) => (
          <Fragment key={a.pane_id}>
            {(!index || group(sorted[index - 1]) !== group(a)) && (
              <h3 className="px-3 pt-2 pb-1 text-xs font-medium text-muted">
                {group(a)}
              </h3>
            )}
            <div className="group relative">
              <button
                data-herdr-item
                disabled={busy}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                  selectedPaneId === a.pane_id && "bg-accent-bg",
                )}
                aria-pressed={selectedPaneId === a.pane_id}
                onClick={() => void open(a.workspace_id, a.pane_id)}
              >
                <HerdrStatus compact state={a.agent_status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {workspaces.find((w) => w.workspace_id === a.workspace_id)
                      ?.label ?? a.workspace_id}
                  </span>
                  <span className="flex items-center gap-1 text-muted">
                    <span className="min-w-0 flex-1 truncate">
                      {a.name ?? a.agent ?? a.pane_id}
                    </span>
                    <HerdrStatus state={a.agent_status} />
                  </span>
                </span>
              </button>
              <div className="absolute right-2 top-1 flex items-center rounded bg-surface opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                {(["prompt", "output", "interrupt"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={button}
                    aria-label={`${t(`herdr.dialog.${mode}`)} ${a.name ?? a.agent ?? a.pane_id}`}
                    title={t(`herdr.dialog.${mode}`)}
                    disabled={
                      busy ||
                      (mode === "prompt" &&
                        !["idle", "done", "working"].includes(
                          a.agent_status,
                        )) ||
                      (mode === "interrupt" && a.agent_status !== "working")
                    }
                    onClick={() => request(mode, a)}
                  >
                    {mode === "prompt" ? (
                      <Send size={12} />
                    ) : mode === "output" ? (
                      <FileText size={12} />
                    ) : (
                      <Square size={12} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </Fragment>
        ))}
        {!agents.length && (
          <p className="p-3 text-xs text-muted">{t("herdr.noMatches")}</p>
        )}
      </div>
    </section>
  );
}
