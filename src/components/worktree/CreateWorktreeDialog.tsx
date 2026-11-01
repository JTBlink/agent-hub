import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBrowserDialog } from "../GitBrowserDialog";
import {
  createProjectWorktree,
  type ProjectWorktree,
} from "../../lib/worktreeApi";
import { refreshProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { getErrorMessage } from "../../lib/error";

/** A new checkout always uses a new branch based on the selected checkout's HEAD. */
export function CreateWorktreeDialog({
  projectId,
  sourcePath,
  projectPath,
  onClose,
  onCreated,
}: {
  projectId: string;
  sourcePath: string;
  projectPath: string;
  onClose: () => void;
  onCreated: (worktree: ProjectWorktree) => void;
}) {
  const { t } = useTranslation();
  const [branch, setBranch] = useState("");
  const [customPath, setCustomPath] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const destination =
    customPath ??
    `${projectPath.replace(/[\\/]+$/, "")}-${branch.trim().replace(/[\\/]/g, "-")}`;
  async function submit() {
    if (pending.current || !branch.trim() || !destination.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const worktree = await createProjectWorktree(
        projectId,
        sourcePath,
        branch.trim(),
        destination.trim(),
      );
      window.dispatchEvent(new Event("project-git-changed"));
      await refreshProjectWorktrees(projectId);
      if (mounted.current) onCreated(worktree);
    } catch (cause) {
      if (mounted.current) setError(getErrorMessage(cause, t("common.error")));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <GitBrowserDialog
      title={t("worktree.create")}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-tertiary">{t("worktree.createHint")}</p>
        <label className="block space-y-1 text-sm text-secondary">
          <span>{t("worktree.newBranch")}</span>
          <input
            data-initial-focus
            required
            disabled={busy}
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            className="app-input w-full"
          />
        </label>
        <label className="block space-y-1 text-sm text-secondary">
          <span>{t("worktree.destination")}</span>
          <input
            required
            disabled={busy}
            value={destination}
            onChange={(event) => setCustomPath(event.target.value)}
            className="app-input w-full"
          />
        </label>
        <p className="text-xs text-muted">{t("worktree.destinationHint")}</p>
        {error && (
          <p role="alert" className="break-words text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="app-button-secondary px-3 py-1.5"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !branch.trim() || !destination.trim()}
            className="app-button-primary px-3 py-1.5"
          >
            {busy ? t("common.loading") : t("worktree.create")}
          </button>
        </div>
      </form>
    </GitBrowserDialog>
  );
}
