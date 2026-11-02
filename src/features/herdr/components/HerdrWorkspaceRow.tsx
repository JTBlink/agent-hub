import { useTranslation } from "react-i18next";
import type { HerdrPane, HerdrWorkspace } from "../lib/herdrControlApi";
import { cn } from "../../../utils";
import { HerdrStatus } from "./HerdrStatus";

/** Compact checkout identity; hover reveals its branch and full path. */
export function HerdrWorkspaceRow({
  workspace,
  agents,
  selected,
  disabled,
  onOpen,
  unavailable = false,
  connector,
}: {
  workspace: HerdrWorkspace;
  agents: HerdrPane[];
  selected: boolean;
  disabled: boolean;
  unavailable?: boolean;
  connector?: "├" | "└";
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const state = ["blocked", "working", "done", "idle"].find((value) =>
    agents.some((agent) => agent.agent_status === value),
  );
  return (
    <button
      data-herdr-item
      data-herdr-workspace={workspace.workspace_id}
      disabled={disabled || unavailable}
      aria-pressed={selected}
      title={[
        workspace.directory ?? t("herdr.directoryUnknown"),
        workspace.branch,
      ]
        .filter(Boolean)
        .join("\n")}
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-1.5 rounded px-1.5 py-0.5 text-left font-mono text-xs transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        selected ? "bg-surface-active" : "hover:bg-surface-hover",
      )}
    >
      {connector && (
        <span aria-hidden="true" className="w-3 shrink-0 leading-5 text-muted">
          {connector}
        </span>
      )}
      {(!connector || state) && (
        <span className="flex h-5 w-3 shrink-0 items-center justify-center">
          {state ? (
            <HerdrStatus compact state={state} />
          ) : (
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate leading-5",
            selected
              ? "font-semibold text-primary"
              : "font-medium text-secondary",
          )}
        >
          {workspace.label}
        </span>
        {!connector && (
          <span
            className={cn(
              "block truncate leading-4",
              selected ? "text-accent-light" : "text-muted",
            )}
          >
            {workspace.branch ??
              workspace.directory ??
              t("herdr.directoryUnknown")}
          </span>
        )}
      </span>
    </button>
  );
}
