import { Pencil, Play, Pause, Trash2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationTask } from "../lib/tauri";

export function AutomationTaskActions({
  task,
  busy,
  pending,
  onRun,
  onEdit,
  onToggle,
  onRemove,
  compact = false,
}: {
  task: AutomationTask;
  busy: boolean;
  pending: boolean;
  compact?: boolean;
  onRun: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const blocked = busy || task.status === "running";
  const mustResume =
    task.source === "hermes" &&
    ["paused", "completed", "error"].includes(task.status);
  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
      {task.can_run && (
        <button
          type="button"
          disabled={blocked || mustResume}
          onClick={onRun}
          aria-label={t("automation.runTask", { name: task.name })}
          title={t(
            mustResume ? "automation.resumeBeforeRun" : "automation.runNow",
          )}
          className={
            compact
              ? "app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent p-1.5"
              : "app-button-secondary"
          }
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {!compact && t("automation.runNow")}
        </button>
      )}
      {!compact && task.can_edit && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            aria-label={t("automation.edit")}
            title={t("automation.edit")}
            className="app-button-secondary"
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            {t("automation.edit")}
          </button>
          {task.definition?.schedule.kind !== "manual" && (
            <button
              type="button"
              disabled={blocked}
              onClick={onToggle}
              aria-label={t(
                task.status === "paused"
                  ? "automation.resume"
                  : "automation.pause",
              )}
              title={t(
                task.status === "paused"
                  ? "automation.resume"
                  : "automation.pause",
              )}
              className="app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent p-2"
            >
              {task.status === "paused" ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            disabled={blocked}
            onClick={onRemove}
            aria-label={t("automation.remove")}
            title={t("automation.remove")}
            className="app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent p-2 text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
