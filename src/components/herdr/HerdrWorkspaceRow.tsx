import { GitBranch, Github, Gitlab, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HerdrPane, HerdrWorkspace } from "../../lib/herdrControlApi";
import { cn } from "../../utils";
import { HerdrStatus } from "./HerdrStatus";

/** Compact workspace identity; the full checkout path remains available on hover. */
export function HerdrWorkspaceRow({
  workspace,
  agents,
  selected,
  disabled,
  onOpen,
}: {
  workspace: HerdrWorkspace;
  agents: HerdrPane[];
  selected: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const state = ["blocked", "working", "done", "idle"].find((value) =>
    agents.some((agent) => agent.agent_status === value),
  );
  const Icon =
    workspace.repository_icon === "github"
      ? Github
      : workspace.repository_icon === "gitlab"
        ? Gitlab
        : workspace.repository_icon || workspace.branch
          ? GitBranch
          : TerminalSquare;
  return (
    <button
      data-herdr-item
      data-herdr-workspace={workspace.workspace_id}
      disabled={disabled}
      aria-pressed={selected}
      title={workspace.directory ?? t("herdr.directoryUnknown")}
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-1.5 rounded-md border px-1.5 py-1 text-left font-mono text-xs transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        selected
          ? "border-border bg-surface-active"
          : "border-transparent hover:bg-surface-hover",
      )}
    >
      <span className="flex h-4 w-3 shrink-0 items-center justify-center">
        {state ? (
          <HerdrStatus compact state={state} />
        ) : (
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 leading-4">
          <Icon
            size={14}
            className={cn(
              "shrink-0",
              workspace.repository_icon ? "text-muted" : "text-accent-light",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "truncate",
              selected
                ? "font-semibold text-primary"
                : "font-medium text-secondary",
            )}
          >
            {workspace.label}
          </span>
        </span>
        <span
          className={cn(
            "block truncate pl-5 leading-4",
            selected ? "text-accent-light" : "text-muted",
          )}
        >
          {workspace.branch ??
            workspace.directory ??
            t("herdr.directoryUnknown")}
        </span>
      </span>
    </button>
  );
}
