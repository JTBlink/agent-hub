import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

/** One project report drives sharing details, per-skill status and ordering. */
export function useProjectLibrary(
  projectId: string | undefined,
  enabled: boolean,
  refreshKey: unknown,
  onChanged: () => Promise<void>,
) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{
    projectId: string;
    status: api.ProjectLibraryStatus | null;
    error: string | null;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<{
    projectId: string;
    directory: string;
  } | null>(null);
  const repairing = useRef(false);
  const statusRequest = useRef(0);
  const activeProject = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeProject.current = enabled ? projectId : undefined;
    return () => {
      activeProject.current = undefined;
    };
  }, [projectId, enabled]);

  useEffect(() => {
    if (!enabled || !projectId) return;
    let cancelled = false;
    const request = ++statusRequest.current;
    api.getProjectLibraryStatus(projectId).then(
      (status) => {
        if (!cancelled && request === statusRequest.current)
          setResult({ projectId, status, error: null });
      },
      (reason) => {
        if (!cancelled && request === statusRequest.current)
          setResult((previous) => ({
            projectId,
            status: previous?.projectId === projectId ? previous.status : null,
            error: getErrorMessage(reason, t("common.error")),
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, refreshKey, retry, t]);

  const repair = useCallback(
    async (directory: string) => {
      if (!enabled || !projectId || repairing.current) return;
      repairing.current = true;
      ++statusRequest.current;
      setPending({ projectId, directory });
      try {
        const status = await api.repairProjectLibrarySkill(
          projectId,
          directory,
        );
        if (activeProject.current !== projectId) return;
        setResult({ projectId, status, error: null });
        toast.success(t("projectLibrary.repaired"));
        await onChanged();
        if (activeProject.current === projectId) setRetry((value) => value + 1);
      } catch (reason) {
        if (activeProject.current === projectId)
          toast.error(getErrorMessage(reason, t("common.error")));
      } finally {
        repairing.current = false;
        setPending(null);
      }
    },
    [enabled, projectId, onChanged, t],
  );

  const reload = useCallback(() => setRetry((value) => value + 1), []);
  const current = enabled && result?.projectId === projectId ? result : null;
  return {
    status: current?.status ?? null,
    error: current?.error ?? null,
    repairingDirectory:
      pending && pending.projectId === projectId ? pending.directory : null,
    retry: reload,
    repair,
  };
}
