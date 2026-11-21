import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EditRunnerDialog } from "./EditRunnerDialog";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  manageRepositoryRunner,
  taskFailure,
  type RepositoryRunner,
  type RepositoryRunnerAction,
} from "../../lib/taskBrowserApi";
import { cn } from "../../utils";
import { runnerReference } from "./runnerStatus";

export function RunnerActions({
  bindingId,
  host,
  runner,
  onChanged,
  compact = false,
}: {
  bindingId: string;
  host: string;
  runner: RepositoryRunner;
  onChanged: (action: RepositoryRunnerAction | "edit") => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<RepositoryRunnerAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const pauseAction = runner.paused ? "resume" : "pause";
  const PauseIcon = runner.paused ? Play : Pause;
  const buttonClass = compact
    ? "app-button-ghost h-7 w-7 p-0"
    : "app-button-secondary text-xs";
  const open = (next: RepositoryRunnerAction) => {
    setError("");
    setAction(next);
  };
  return (
    <>
      <div
        className={cn(
          "flex items-center",
          compact ? "justify-end gap-0.5" : "mb-4 flex-wrap gap-2",
        )}
      >
        {runner.can_update === true && (
          <button
            type="button"
            className={buttonClass}
            aria-label={t("runners.actions.edit")}
            title={t("runners.actions.edit")}
            onClick={() => setEditing(true)}
          >
            {compact ? (
              <Pencil size={15} aria-hidden="true" />
            ) : (
              t("runners.actions.edit")
            )}
          </button>
        )}
        {runner.can_update === true && runner.paused != null && (
          <button
            type="button"
            className={buttonClass}
            aria-label={t(`runners.actions.${pauseAction}`)}
            title={t(`runners.actions.${pauseAction}`)}
            onClick={() => open(pauseAction)}
          >
            {compact ? (
              <PauseIcon size={15} aria-hidden="true" />
            ) : (
              t(`runners.actions.${pauseAction}`)
            )}
          </button>
        )}
        {runner.can_delete === true && (
          <button
            type="button"
            className={cn(buttonClass, "text-danger")}
            aria-label={t("runners.actions.delete")}
            title={t("runners.actions.delete")}
            onClick={() => open("delete")}
          >
            {compact ? (
              <Trash2 size={15} aria-hidden="true" />
            ) : (
              t("runners.actions.delete")
            )}
          </button>
        )}
      </div>
      {editing && (
        <EditRunnerDialog
          bindingId={bindingId}
          runner={runner}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged("edit");
          }}
        />
      )}
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
