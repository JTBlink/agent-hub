import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  cancelTaskQuery,
  editRepositoryRunner,
  getRepositoryRunnerDetails,
  taskFailure,
  type RepositoryRunner,
  type RepositoryRunnerEdit,
} from "../../lib/taskBrowserApi";
import { AppDialog } from "../AppDialog";
import { ThemedSelect } from "../ThemedSelect";
import { runnerReference } from "./runnerStatus";

const options = ["run_untagged", "locked", "protected"] as const;
type EditOption = (typeof options)[number];
type Draft = Record<EditOption, boolean | null> & {
  description: string;
  labels: string;
};

function runnerDraft(runner: RepositoryRunner): Draft {
  return {
    description: runner.description ?? "",
    labels: runner.labels?.join(", ") ?? "",
    run_untagged: runner.run_untagged ?? null,
    locked: runner.locked ?? null,
    protected: runner.protected ?? null,
  };
}

export function EditRunnerDialog({
  bindingId,
  runner,
  onClose,
  onSaved,
}: {
  bindingId: string;
  runner: RepositoryRunner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [original, setOriginal] = useState<RepositoryRunner>();
  const [draft, setDraft] = useState<Draft>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const request = crypto.randomUUID();
    void getRepositoryRunnerDetails(bindingId, runner.id, request)
      .then((data) => {
        if (!active) return;
        if (!data.can_update) {
          setError("runners.edit.permission");
          return;
        }
        setOriginal(data);
        setDraft(runnerDraft(data));
      })
      .catch((reason: unknown) => {
        if (active) setError(taskFailure(reason).message);
      });
    return () => {
      active = false;
      void cancelTaskQuery(request).catch(() => {});
    };
  }, [attempt, bindingId, runner.id]);

  const edit: RepositoryRunnerEdit = {};
  if (original && draft) {
    const initial = runnerDraft(original);
    if (draft.description !== initial.description)
      edit.description = draft.description;
    if (draft.labels !== initial.labels) {
      edit.labels = [
        ...new Set(
          draft.labels
            .split(",")
            .map((label) => label.trim())
            .filter(Boolean),
        ),
      ];
    }
    for (const option of options) {
      if (draft[option] !== null && draft[option] !== initial[option])
        edit[option] = draft[option];
    }
  }
  const canSave = Object.keys(edit).length > 0 && !busy;
  return (
    <AppDialog title={t("runners.actions.edit")} busy={busy} onClose={onClose}>
      <p className="mb-3 break-words text-xs text-muted">
        {runner.name} · {runnerReference(runner)}
      </p>
      {original && draft ? (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSave) return;
            setError("");
            setBusy(true);
            try {
              await editRepositoryRunner(bindingId, runner.id, edit);
              onSaved();
            } catch (reason) {
              setError(taskFailure(reason).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-1 text-xs">
            <span>{t("runners.edit.description")}</span>
            <input
              className="app-input w-full"
              value={draft.description}
              maxLength={255}
              disabled={busy}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span>{t("runners.labels")}</span>
            <input
              className="app-input w-full"
              value={draft.labels}
              disabled={busy}
              placeholder={t("runners.edit.tagsPlaceholder")}
              onChange={(event) =>
                setDraft({ ...draft, labels: event.target.value })
              }
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options
              .filter(
                (option) => option !== "locked" || original.scope === "project",
              )
              .map((option) => (
                <label key={option} className="block space-y-1 text-xs">
                  <span>{t(`runners.edit.${option}`)}</span>
                  <ThemedSelect
                    aria-label={t(`runners.edit.${option}`)}
                    className="w-full"
                    value={
                      draft[option] === null ? "keep" : String(draft[option])
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft({
                        ...draft,
                        [option]: value === "keep" ? null : value === "true",
                      });
                    }}
                    disabled={busy}
                  >
                    {original[option] == null && (
                      <option value="keep">{t("runners.edit.keep")}</option>
                    )}
                    <option value="true">{t("runners.yes")}</option>
                    <option value="false">{t("runners.no")}</option>
                  </ThemedSelect>
                </label>
              ))}
          </div>
          <button
            type="submit"
            className="app-button-primary"
            disabled={!canSave}
          >
            {t("common.save")}
          </button>
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
        <p role="alert" className="mt-3 text-xs text-danger">
          {error === "runners.edit.permission" ? t(error) : error}
        </p>
      )}
    </AppDialog>
  );
}
