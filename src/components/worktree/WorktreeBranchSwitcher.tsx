import { useRef, useState } from "react";
import { ChevronDown, GitBranch, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GitBranchDialog } from "../git/GitBranchDialog";
import { runProjectGitAction } from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";

/** Switch Git branches within the selected checkout without navigating away. */
export function WorktreeBranchSwitcher({
  projectId,
  worktreePath,
  branch,
  label,
  disabled,
}: {
  projectId: string;
  worktreePath?: string;
  branch?: string;
  label: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        aria-label={t("git.actions.switchBranch")}
        title={`${t("git.actions.switchBranch")} · ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="app-button-ghost flex h-7 w-full min-w-0 items-center gap-1 rounded px-1 text-xs text-muted hover:text-secondary"
      >
        {busy ? (
          <Loader2 size={13} className="shrink-0 animate-spin" />
        ) : (
          <GitBranch size={13} className="shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <GitBranchDialog
          projectId={projectId}
          worktreePath={worktreePath}
          current={branch ?? label}
          actionError={error}
          onClose={() => {
            if (!pending.current) {
              setOpen(false);
              setError(undefined);
            }
          }}
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
      )}
    </>
  );
}
