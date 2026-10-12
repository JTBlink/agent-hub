import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { ProjectSharingFiles } from "./ProjectSharingFiles";

/** Team files remain usable without this UI or a personal Skills database. */
export function ProjectLibraryPanel({
  projectId,
  refreshKey,
  onChanged,
}: {
  projectId: string;
  refreshKey: unknown;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<api.ProjectLibraryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setError(null);
    api
      .getProjectLibraryStatus(projectId)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(getErrorMessage(reason, t("common.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey, retry, t]);

  const repair = async (directory: string) => {
    setBusy(true);
    try {
      await api.repairProjectLibrarySkill(projectId, directory);
      toast.success(t("projectLibrary.repaired"));
      await onChanged();
      setRetry((value) => value + 1);
    } catch (reason) {
      toast.error(getErrorMessage(reason, t("common.error")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="mb-3 rounded-lg border border-border-subtle bg-surface px-4 py-3 text-[12px] text-muted">
      <p>{t("projectLibrary.description")}</p>
      <p className="mt-1" title={t("projectLibrary.centralHelp")}>
        {t("projectLibrary.centralLibrary")} · <code>.agents/skills</code>
      </p>
      {error && (
        <div role="alert" className="mt-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="ml-2 text-accent-light"
          >
            {t("common.refresh")}
          </button>
        </div>
      )}
      {status && <ProjectSharingFiles status={status} />}
      {status?.skills.map(
        (skill) =>
          (skill.modified || skill.stale_targets.length > 0) && (
            <div
              key={skill.directory}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <span>
                {skill.name}:{" "}
                {t(
                  skill.modified
                    ? "projectLibrary.modified"
                    : "projectLibrary.stale",
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void repair(skill.directory)}
                className="inline-flex items-center gap-1 text-accent-light disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                {t("projectLibrary.repair")}
              </button>
            </div>
          ),
      )}
    </aside>
  );
}
