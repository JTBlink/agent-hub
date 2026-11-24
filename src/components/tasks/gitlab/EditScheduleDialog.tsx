import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getScheduleConfig,
  editRepositorySchedule,
  type ScheduleConfig,
} from "../../../lib/repositoryScheduleApi";
import { cancelTaskQuery, taskFailure } from "../../../lib/taskBrowserApi";
import { AppDialog } from "../../AppDialog";
import { ToggleSwitch } from "../../ToggleSwitch";

const textFields = ["title", "target", "cron", "timezone"] as const;

export function EditScheduleDialog({
  bindingId,
  scheduleId,
  reference,
  onClose,
  onSaved,
}: {
  bindingId: string;
  scheduleId: number;
  reference: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [original, setOriginal] = useState<ScheduleConfig>();
  const [draft, setDraft] = useState<ScheduleConfig>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    const requestId = crypto.randomUUID();
    void getScheduleConfig(bindingId, scheduleId, requestId)
      .then((data) => {
        if (active) {
          setOriginal(data);
          setDraft(data);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(taskFailure(reason).message);
      });
    return () => {
      active = false;
      void cancelTaskQuery(requestId).catch(() => {});
    };
  }, [attempt, bindingId, scheduleId]);
  const edit: Partial<ScheduleConfig> = {};
  if (original && draft) {
    for (const key of textFields)
      if (draft[key] !== original[key]) edit[key] = draft[key];
    if (draft.active !== original.active) edit.active = draft.active;
  }
  const canSave =
    !!draft &&
    textFields.every((key) => draft[key].trim()) &&
    Object.keys(edit).length > 0 &&
    !busy;
  return (
    <AppDialog title={t("schedules.edit")} busy={busy} onClose={onClose}>
      <p className="mb-4 break-words text-xs text-muted">
        {reference} · #{scheduleId}
      </p>
      {draft ? (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSave || pending.current) return;
            pending.current = true;
            setBusy(true);
            setError("");
            try {
              await editRepositorySchedule(bindingId, scheduleId, edit);
              toast.success(t("schedules.saved"));
              onSaved();
            } catch (reason) {
              setError(taskFailure(reason).message);
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          {textFields.map((field) => (
            <label key={field} className="block space-y-1 text-xs">
              <span>{t(`schedules.fields.${field}`)}</span>
              <input
                className="app-input w-full"
                required
                value={draft[field]}
                disabled={busy}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(event) =>
                  setDraft({ ...draft, [field]: event.target.value })
                }
              />
            </label>
          ))}
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{t("schedules.active")}</span>
            <ToggleSwitch
              checked={draft.active}
              disabled={busy}
              title={t("schedules.active")}
              onChange={() => setDraft({ ...draft, active: !draft.active })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="app-button-secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="app-button-primary"
              disabled={!canSave}
            >
              {t(busy ? "common.loading" : "common.save")}
            </button>
          </div>
        </form>
      ) : error ? (
        <button
          type="button"
          className="app-button-secondary"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          {t("common.retry")}
        </button>
      ) : (
        <p role="status" className="text-xs text-muted">
          {t("common.loading")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 break-words text-xs text-danger">
          {error}
        </p>
      )}
    </AppDialog>
  );
}
