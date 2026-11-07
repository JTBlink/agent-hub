import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";
import { ThemedSelect } from "../ThemedSelect";
import {
  getProjectGitRemotes,
  runProjectGitTagAction,
  type GitRemote,
} from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";
import type { CommitTarget } from "./GitCommitDetails";
import type { GitTagRequest } from "./gitReferenceActions";

export function GitTagActionDialog({
  target,
  request,
  busy,
  onRun,
  onClose,
}: {
  target: CommitTarget;
  request: GitTagRequest;
  busy: boolean;
  onRun: (operation: () => Promise<void>) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [branch, setBranch] = useState("");
  const [remote, setRemote] = useState("");
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([target.projectId, target.worktreePath, retry]);
  const [response, setResponse] = useState<{
    key: string;
    remotes?: GitRemote[];
    error?: string;
  }>();
  const current = response?.key === key ? response : undefined;
  const remotes = current?.remotes;
  const remoteError = current?.error;
  useEffect(() => {
    if (request.action !== "push") return;
    let cancelled = false;
    void getProjectGitRemotes(target.projectId, target.worktreePath).then(
      (result) => {
        if (cancelled) return;
        setResponse({ key, remotes: result });
        setRemote(result.length === 1 ? result[0].name : "");
      },
      (cause) => {
        if (!cancelled)
          setResponse({
            key,
            error: getErrorMessage(cause, t("common.error")),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request.action, target.projectId, target.worktreePath, key, t]);
  const confirm = async () => {
    if (busy) return false;
    setError(undefined);
    const success = await onRun(async () => {
      try {
        await runProjectGitTagAction(
          target.projectId,
          target.worktreePath,
          request.action,
          request.name,
          request.sha,
          { branch: branch.trim() || undefined, remote: remote || undefined },
        );
      } catch (cause) {
        setError(getErrorMessage(cause, t("common.error")));
        throw cause;
      }
    });
    return success ? undefined : false;
  };
  return createPortal(
    <ConfirmDialog
      open
      title={t(`git.tagActions.${request.action}`)}
      message={t(`git.tagActions.${request.action}Hint`)}
      details={[request.name]}
      tone={request.action === "delete" ? "danger" : "warning"}
      confirmLabel={t(`git.tagActions.${request.action}`)}
      confirmDisabled={
        busy ||
        (request.action === "create_branch" && !branch.trim()) ||
        (request.action === "push" &&
          !remotes?.some((item) => item.name === remote))
      }
      onClose={onClose}
      onConfirm={confirm}
      initialFocusRef={
        request.action === "create_branch" ? inputRef : undefined
      }
      submitOnEnter={request.action === "create_branch"}
    >
      {request.action === "create_branch" && (
        <label className="block text-sm text-secondary" htmlFor={inputId}>
          {t("git.actions.branchName")}
          <input
            ref={inputRef}
            id={inputId}
            value={branch}
            disabled={busy}
            onChange={(event) => setBranch(event.target.value)}
            className="mt-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-primary focus:border-accent focus:outline-none"
          />
        </label>
      )}
      {request.action === "push" && (
        <div className="space-y-2 text-sm text-secondary">
          {remotes?.length ? (
            <>
              <label htmlFor={inputId}>{t("git.tagActions.remote")}</label>
              <ThemedSelect
                id={inputId}
                aria-label={t("git.tagActions.remote")}
                value={remote}
                disabled={busy}
                onChange={(event) => setRemote(event.target.value)}
              >
                <option value="" disabled>
                  {t("git.tagActions.selectRemote")}
                </option>
                {remotes.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </ThemedSelect>
            </>
          ) : (
            <p role={remoteError ? "alert" : "status"}>
              {remoteError ??
                t(remotes ? "git.actions.noRemotes" : "common.loading")}
            </p>
          )}
          {remoteError && (
            <button
              type="button"
              className="app-button-ghost px-2"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </ConfirmDialog>,
    document.body,
  );
}
