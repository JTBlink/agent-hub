import { useTranslation } from "react-i18next";
import type { HerdrPane, HerdrWorkspace } from "../lib/herdrControlApi";
import { worktreeDirectoryName } from "../../../lib/worktreeApi";
import { cn } from "../../../utils";
import { HerdrStatus } from "./HerdrStatus";

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
  connector?: "branch" | "last";
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const displayName =
    workspace.label ||
    (workspace.directory ? worktreeDirectoryName(workspace.directory) : "");
  const branchLabel =
    workspace.branch ??
    (workspace.detached
      ? [workspace.head?.slice(0, 7), "(detached HEAD)"]
          .filter(Boolean)
          .join(" ")
      : "—");
  const state = ["blocked", "working", "done", "idle"].find((value) =>
    agents.some((agent) => agent.agent_status === value),
  );
  return (
    <button
      data-herdr-item
      data-herdr-workspace={workspace.workspace_id}
      disabled={disabled || unavailable}
      aria-label={`${displayName} ${branchLabel}`}
      aria-pressed={selected}
      title={[
        workspace.directory ?? t("herdr.directoryUnknown"),
        branchLabel === "—" ? null : branchLabel,
      ]
        .filter(Boolean)
        .join("\n")}
      onClick={() => {
        if (!selected) onOpen();
      }}
      className={cn(
        "flex w-full items-start gap-1.5 rounded px-1.5 py-0.5 text-left font-mono text-xs transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        selected ? "bg-surface-active" : "hover:bg-surface-hover",
      )}
    >
      {connector && (
        <span
          aria-hidden="true"
          data-herdr-connector={connector}
          className="relative -my-0.5 w-3 shrink-0 self-stretch text-border"
        >
          <span
            className={cn(
              "absolute left-1 top-0 w-px bg-current",
              connector === "last" ? "h-3" : "bottom-0",
            )}
          />
          <span className="absolute left-1 top-3 h-px w-2 bg-current" />
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
          data-herdr-directory
          className={cn(
            "block truncate leading-5",
            selected
              ? "font-semibold text-primary"
              : "font-medium text-secondary",
          )}
        >
          {displayName}
        </span>
        <span
          data-herdr-branch
          className="block truncate font-normal leading-4 text-muted"
        >
          {branchLabel}
        </span>
      </span>
    </button>
  );
}
