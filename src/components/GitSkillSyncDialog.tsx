import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalSkillSyncApproval, LocalSkillSyncPlan } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { GitBrowserDialog } from "./GitBrowserDialog";

export function GitSkillSyncDialog({
  target,
  onSync,
  onClose,
}: {
  target: string;
  onSync: (approval?: LocalSkillSyncApproval) => Promise<LocalSkillSyncPlan>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<LocalSkillSyncPlan | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sync = useRef(onSync);
  useEffect(() => {
    sync.current = onSync;
  }, [onSync]);
  useEffect(() => {
    let active = true;
    void sync
      .current()
      .then((value) => {
        if (active) setPlan(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(getErrorMessage(cause, t("common.error")));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, t]);
  return (
    <GitBrowserDialog
      title={t("install.gitBrowser.syncToRepository")}
      busy={busy}
      onClose={onClose}
    >
      <p className="text-[13px] leading-6 text-secondary">
        {t("install.gitBrowser.syncDescription")}
      </p>
      <p className="my-3 break-all text-[12px] text-muted">{target}</p>
      {busy && <p role="status">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="my-3 break-words text-[13px] text-danger">
          {error}
        </p>
      )}
      {plan && (
        <>
          <p className="text-[13px] text-secondary">
            {t("install.gitBrowser.syncVersions", {
              before: plan.repository_version,
              after: plan.library_version,
            })}
          </p>
          {plan.approval.removed_paths.length > 0 && (
            <div className="mt-3 text-[13px] text-danger">
              <p>{t("install.gitBrowser.syncRemovals")}</p>
              <ul className="max-h-40 list-disc overflow-auto break-all pl-5">
                {plan.approval.removed_paths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          className="app-button-secondary"
          onClick={onClose}
        >
          {t("common.cancel")}
        </button>
        {error ? (
          <button
            type="button"
            disabled={busy}
            className="app-button-primary"
            onClick={() => {
              setError(null);
              setPlan(null);
              setBusy(true);
              setAttempt((value) => value + 1);
            }}
          >
            {t("common.retry")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !plan}
            className="app-button-primary"
            onClick={() => {
              if (!plan) return;
              setBusy(true);
              void onSync(plan.approval)
                .then((result) => {
                  if (result.applied) onClose();
                })
                .catch((cause: unknown) =>
                  setError(getErrorMessage(cause, t("common.error"))),
                )
                .finally(() => setBusy(false));
            }}
          >
            {t("install.gitBrowser.confirmSync")}
          </button>
        )}
      </div>
    </GitBrowserDialog>
  );
}
