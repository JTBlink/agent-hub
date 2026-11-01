import { useRef, useState } from "react";
import { ChevronDown, GitBranch, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GitBranchMenu } from "../git/GitBranchMenu";
import { runProjectGitAction } from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";
import { cn } from "../../utils";

/** Switch Git branches within the selected checkout without navigating away. */
export function WorktreeBranchSwitcher({
  projectId,
  worktreePath,
  branch,
  label,
  disabled,
  compact = false,
}: {
  projectId: string;
  worktreePath?: string;
  branch?: string;
  label: string;
  disabled: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  return (
    <>
      <GitBranchMenu
        projectId={projectId}
        worktreePath={worktreePath}
        current={branch ?? label}
        label={t("git.actions.switchBranch")}
        disabled={disabled || busy}
        className="w-full min-w-0"
        triggerClassName={cn(
          "app-button-ghost w-full min-w-0 gap-1.5 rounded px-2 text-xs text-secondary hover:text-primary",
          compact
            ? "h-[calc(26px/var(--app-scale))]"
            : "h-7 border border-border-subtle bg-surface",
        )}
        triggerIcon={
          <>
            {busy ? (
              <Loader2 size={13} className="shrink-0 animate-spin" />
            ) : (
              <GitBranch size={13} className="shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate text-left" title={label}>
              {label}
            </span>
            <ChevronDown size={13} className="shrink-0" />
          </>
        }
        onRun={async (action, name) => {
          if (pending.current || !worktreePath) return false;
          pending.current = true;
          setBusy(true);
          setError(undefined);
          try {
            await runProjectGitAction(projectId, worktreePath, action, name);
            return true;
          } catch (cause) {
            setError(getErrorMessage(cause, t("common.error")));
            return false;
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      />
      {error && (
        <p
          role="alert"
          className={cn(
            "break-words text-xs text-danger",
            compact &&
              "absolute bottom-full left-0 z-50 w-72 rounded border border-border bg-surface p-2 shadow-card",
          )}
        >
          {error}
        </p>
      )}
    </>
  );
}
