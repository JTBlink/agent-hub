import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  manageRepositoryRunner,
  taskFailure,
  type RepositoryRunner,
  type RepositoryRunnerAction,
} from "../../lib/taskBrowserApi";
import { runnerReference } from "./runnerStatus";

export function RunnerActions({
  bindingId,
  host,
  runner,
  onChanged,
}: {
  bindingId: string;
  host: string;
  runner: RepositoryRunner;
  onChanged: (action: RepositoryRunnerAction) => void;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<RepositoryRunnerAction | null>(null);
  const [error, setError] = useState("");
  const pauseAction = runner.paused ? "resume" : "pause";
  const open = (next: RepositoryRunnerAction) => {
    setError("");
    setAction(next);
  };
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {runner.can_update === true && runner.paused != null && (
          <button
            type="button"
            className="app-button-secondary text-xs"
            onClick={() => open(pauseAction)}
          >
            {t(`runners.actions.${pauseAction}`)}
          </button>
        )}
        {runner.can_delete === true && (
          <button
            type="button"
            className="app-button-ghost text-xs text-danger"
            onClick={() => open("delete")}
          >
            {t("runners.actions.delete")}
          </button>
        )}
      </div>
      {action && (
        <ConfirmDialog
          open
          title={t(`runners.actions.${action}`)}
          message={t(`runners.actions.${action}Message`)}
          details={[`${runner.name} · ${host} · ${runnerReference(runner)}`]}
          confirmLabel={t(`runners.actions.${action}`)}
          tone={action === "delete" ? "danger" : "warning"}
          onClose={() => setAction(null)}
          onConfirm={async () => {
            setError("");
            try {
              await manageRepositoryRunner(bindingId, runner.id, action);
              onChanged(action);
            } catch (reason) {
              const failure = taskFailure(reason);
              setError(
                t(`tasks.errors.${failure.kind}`, {
                  defaultValue: failure.message,
                }),
              );
              return false;
            }
          }}
        >
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
