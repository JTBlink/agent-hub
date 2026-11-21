import { useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  createRepositoryRunner,
  taskFailure,
  type TaskBinding,
} from "../../lib/taskBrowserApi";
import { AppDialog } from "../AppDialog";
import { ThemedSelect } from "../ThemedSelect";

export function CreateProjectRunnerDialog({
  projects,
  onClose,
  onCreated,
}: {
  projects: TaskBinding[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [bindingId, setBindingId] = useState(projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: number; token: string }>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const target = projects.find((binding) => binding.id === bindingId);
  return (
    <AppDialog title={t("runners.create.title")} busy={busy} onClose={onClose}>
      {result ? (
        <div className="space-y-3 text-sm">
          <p>{t("runners.create.created", { id: result.id })}</p>
          <code className="block select-all break-all rounded bg-bg-secondary p-2">
            {result.token}
          </code>
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => {
              void writeText(result.token)
                .then(() => setCopied(true))
                .catch(() => setError(t("common.error")));
            }}
          >
            {copied
              ? t("runners.create.copied")
              : t("runners.create.copyToken")}
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target || !name.trim() || busy) return;
            setBusy(true);
            setError("");
            try {
              setResult(await createRepositoryRunner(target.id, name.trim()));
              onCreated();
            } catch (reason) {
              setError(taskFailure(reason).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ThemedSelect
            aria-label={t("tasks.project")}
            value={target?.id ?? ""}
            onChange={(event) => setBindingId(event.target.value)}
            disabled={busy}
          >
            {projects.map((binding) => (
              <option key={binding.id} value={binding.id}>
                {binding.host}/{binding.repository}
              </option>
            ))}
          </ThemedSelect>
          <label className="block space-y-1 text-xs">
            <span>{t("runners.create.name")}</span>
            <input
              className="app-input w-full"
              data-initial-focus
              value={name}
              maxLength={255}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="app-button-primary"
            disabled={!target || !name.trim() || busy}
          >
            {t("runners.create.title")}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </AppDialog>
  );
}
