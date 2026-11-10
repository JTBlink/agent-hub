import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProjectGitStatus, type GitStatus } from "../lib/gitApi";
import { peekProjectGitStatus } from "../lib/projectGitStatus";
import { getErrorMessage } from "../lib/error";

/** Keep an ordinary folder distinct from a failed read and discard old checkout responses. */
export function useProjectGitStatus(
  projectId: string | undefined,
  worktreePath: string | undefined,
  revision: number,
) {
  const { t } = useTranslation();
  const scope = JSON.stringify([projectId, worktreePath]);
  const key = JSON.stringify([scope, revision]);
  const [result, setResult] = useState<{
    key: string;
    scope: string;
    data?: GitStatus | null;
    error?: string;
  }>();
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void getProjectGitStatus(projectId, worktreePath).then(
      (data) => {
        if (!cancelled) setResult({ key, scope, data });
      },
      (cause) => {
        if (!cancelled)
          setResult({
            key,
            scope,
            error: getErrorMessage(cause, t("common.error")),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreePath, scope, key, t]);
  return {
    status:
      result?.scope === scope
        ? result.data
        : projectId
          ? peekProjectGitStatus(projectId, worktreePath)
          : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: !!projectId && result?.key !== key,
  };
}
