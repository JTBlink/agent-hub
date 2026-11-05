import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProjectGitRemotes, type GitRemote } from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";
import type { CardAction } from "../CardActionMenu";
import { useGitCopyActions } from "./useGitCopyActions";

/** Read fresh local configuration only while the source-control menu is open. */
export function useGitRemoteCopyActions(
  target: { projectId: string; worktreePath?: string } | undefined,
) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    remotes?: GitRemote[];
    error?: string;
  }>();
  const projectId = target?.projectId;
  const worktreePath = target?.worktreePath;
  const key = JSON.stringify([projectId, worktreePath, open, retry]);
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    void getProjectGitRemotes(projectId, worktreePath).then(
      (remotes) => {
        if (!cancelled) setResult({ key, remotes });
      },
      (cause) => {
        if (!cancelled)
          setResult({ key, error: getErrorMessage(cause, t("common.error")) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, projectId, worktreePath, key, t]);
  const current = result?.key === key ? result : undefined;
  const remotes = current?.remotes;
  const copies = useGitCopyActions(
    (remotes ?? []).map(({ name, url }) => ({
      key: `copy-remote:${name}`,
      label:
        remotes?.length === 1
          ? t("git.actions.copyRemoteUrl")
          : t("git.actions.copyNamedRemoteUrl", { name }),
      text: url,
    })),
  );
  const actions: CardAction[] = copies.length
    ? copies
    : [
        {
          key: "copy-remote",
          label: current?.error
            ? `${current.error} · ${t("common.retry")}`
            : remotes
              ? t("git.actions.noRemotes")
              : t("git.actions.copyRemoteUrl"),
          disabled: !current?.error,
          keepOpen: true,
          onSelect: () => setRetry((value) => value + 1),
        },
      ];
  return {
    actions,
    onOpenChange: (next: boolean) => {
      setOpen(next);
      if (next) setRetry((value) => value + 1);
    },
  };
}
