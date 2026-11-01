import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";
import { ThemedSelect } from "../ThemedSelect";
import { getProjectGitReferences } from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";

export function GitBranchDialog({
  projectId,
  worktreePath,
  current,
  actionError,
  onClose,
  onRun,
}: {
  projectId: string;
  worktreePath?: string;
  current: string;
  actionError?: string;
  onClose: () => void;
  onRun: (
    action: "switch_branch" | "create_branch",
    branch: string,
  ) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<string[]>();
  const [selected, setSelected] = useState(current);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBranches(undefined);
    setError(undefined);
    void getProjectGitReferences(projectId, worktreePath).then(
      (data) => {
        if (cancelled) return;
        setBranches(
          data.entries
            .filter((entry) => entry.kind === "branches")
            .map((entry) => entry.name),
        );
        setTruncated(data.truncated);
      },
      (cause) => {
        if (!cancelled) setError(getErrorMessage(cause, t("common.error")));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreePath, retry, t]);
  return (
    <ConfirmDialog
      open
      title={t("git.actions.branches")}
      message={t("git.actions.branchHint")}
      tone="warning"
      confirmLabel={t(
        creating ? "git.actions.createBranch" : "git.actions.switchBranch",
      )}
      confirmDisabled={
        pending ||
        (creating
          ? !name.trim()
          : !branches?.includes(selected) || selected === current)
      }
      onClose={onClose}
      onConfirm={async () => {
        setPending(true);
        try {
          return (await onRun(
            creating ? "create_branch" : "switch_branch",
            creating ? name.trim() : selected,
          ))
            ? undefined
            : false;
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-3 py-3 text-xs">
        {actionError && (
          <p role="alert" className="text-danger">
            {actionError}
          </p>
        )}
        <label className="flex items-center gap-2 text-secondary">
          <input
            type="checkbox"
            checked={creating}
            disabled={pending}
            onChange={(event) => setCreating(event.target.checked)}
          />
          {t("git.actions.createBranch")}
        </label>
        {creating ? (
          <input
            aria-label={t("git.actions.branchName")}
            value={name}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            className="h-8 w-full rounded border border-border bg-background px-2 text-primary focus:border-accent focus:outline-none"
          />
        ) : (
          <ThemedSelect
            aria-label={t("git.actions.switchBranch")}
            value={selected}
            disabled={pending || !branches}
            onChange={(event) => setSelected(event.target.value)}
            className="w-full"
          >
            <option value={current}>{current}</option>
            {branches
              ?.filter((branch) => branch !== current)
              .map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
          </ThemedSelect>
        )}
        {!branches && !error && (
          <p role="status" className="text-muted">
            {t("common.loading")}
          </p>
        )}
        {truncated && (
          <p className="text-muted">{t("git.referencesTruncated")}</p>
        )}
        {error && (
          <div role="alert" className="text-danger">
            {error}
            <button
              type="button"
              className="app-button-ghost ml-2 px-2"
              disabled={pending}
              onClick={() => setRetry((value) => value + 1)}
            >
              {t("common.retry")}
            </button>
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
