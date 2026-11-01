import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import {
  searchWorktree,
  type WorktreeSearchOptions,
  type WorktreeSearchResult,
} from "../lib/worktreeSearchApi";
import { getErrorMessage } from "../lib/error";

/** Results belong to the complete scope and options; stale responses never become actionable. */
export function useWorktreeSearch(
  projectId: string | undefined,
  worktreePath: string | undefined,
  options: WorktreeSearchOptions,
  active: boolean,
) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const key = JSON.stringify([projectId, worktreePath, options, revision]);
  const [result, setResult] = useState<{
    key: string;
    data?: WorktreeSearchResult;
    error?: string;
  }>();
  const requested = active && !!projectId && !!worktreePath && !!options.query;
  useEffect(() => {
    if (!requested || !projectId || !worktreePath) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchWorktree(projectId, worktreePath, options).then(
        (data) => {
          if (!cancelled) setResult({ key, data });
        },
        (cause) => {
          if (!cancelled)
            setResult({
              key,
              error: getErrorMessage(cause, t("common.error")),
            });
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, requested, projectId, worktreePath, options, t]);
  return {
    data: requested && result?.key === key ? result.data : undefined,
    error: requested && result?.key === key ? result.error : undefined,
    loading: requested && result?.key !== key,
    refresh,
  };
}
