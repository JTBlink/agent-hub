import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { deleteRepositorySchedule } from "../../../lib/repositoryScheduleApi";
import { taskFailure, type TaskBinding } from "../../../lib/taskBrowserApi";
import type { RepositorySchedule } from "../../../lib/repositoryScheduleApi";
import { PlatformOpenButton } from "../../PlatformOpenButton";
import { ConfirmDialog } from "../../ConfirmDialog";
import { ScheduleRunButton } from "./ScheduleRunButton";
import { EditScheduleDialog } from "./EditScheduleDialog";

export function GitlabScheduleActions({
  binding,
  schedule,
  onChanged,
}: {
  binding: TaskBinding;
  schedule: RepositorySchedule;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const id = Number(schedule.id);
  const manageable =
    /^\d+$/.test(schedule.id) && Number.isSafeInteger(id) && id > 0;
  const reference = `${binding.host}/${binding.repository}`;
  const buttonClass = "app-button-ghost h-8 w-8 shrink-0 rounded-none p-0";
  return (
    <>
      <div className="inline-flex items-center divide-x divide-border-subtle overflow-hidden rounded-md border border-border-subtle">
        {manageable && (
          <>
            <ScheduleRunButton
              bindingId={binding.id}
              scheduleId={id}
              title={schedule.title}
              onAccepted={onChanged}
            />
            <button
              type="button"
              className={buttonClass}
              title={t("schedules.edit")}
              aria-label={t("schedules.edit")}
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          </>
        )}
        <PlatformOpenButton
          url={schedule.url}
          host={binding.host}
          label={t("tasks.openRemote")}
          className={buttonClass}
        />
        {manageable && (
          <button
            type="button"
            className={`${buttonClass} text-danger hover:bg-danger-bg`}
            title={t("schedules.delete")}
            aria-label={t("schedules.delete")}
            onClick={() => {
              setError("");
              setDeleting(true);
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {editing && (
        <EditScheduleDialog
          bindingId={binding.id}
          scheduleId={id}
          reference={reference}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t("schedules.delete")}
          message={t("schedules.deleteMessage")}
          details={[schedule.title, `${reference} · #${id}`]}
          confirmLabel={t("common.delete")}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            setError("");
            try {
              await deleteRepositorySchedule(binding.id, id);
              setDeleting(false);
              toast.success(t("schedules.deleted"));
              onChanged();
            } catch (reason) {
              setError(taskFailure(reason).message);
              return false;
            }
          }}
        >
          {error && (
            <p role="alert" className="break-words text-xs text-danger">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
