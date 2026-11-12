import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationDraft } from "../lib/tauri";
import {
  automationActions,
  withAutomationActions,
  type AutomationAction,
} from "../lib/automationActions";

export function AutomationActionsEditor({
  draft,
  disabled,
  onChange,
}: {
  draft: AutomationDraft;
  disabled: boolean;
  onChange: (value: Partial<AutomationDraft>) => void;
}) {
  const { t } = useTranslation();
  const { actions, invalid } = automationActions(draft);
  const update = (id: string, value: Partial<AutomationAction>) =>
    onChange(
      withAutomationActions(
        draft,
        actions.map((action) =>
          action.id === id ? { ...action, ...value } : action,
        ),
      ),
    );
  const scripts = (draft.files ?? []).filter((file) =>
    /\.(sh|ps1|py)$/.test(file.path),
  );
  return (
    <details className="rounded-lg border border-border-subtle bg-surface p-4">
      <summary className="cursor-pointer text-xs font-medium text-secondary">
        {t("automation.customActions.title")}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-xs leading-6 text-muted">
          {t("automation.customActions.help")}
        </p>
        {invalid && (
          <p role="alert" className="text-xs text-danger">
            {t("automation.customActions.invalid")}
          </p>
        )}
        {actions.map((action, index) => (
          <fieldset
            key={action.id}
            disabled={disabled}
            className="space-y-3 rounded border border-border-subtle p-3"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {t("automation.customActions.operation", { number: index + 1 })}
              </span>
              <button
                type="button"
                className="app-button-ghost p-1"
                aria-label={t("automation.customActions.remove", {
                  name: action.name,
                })}
                onClick={() =>
                  onChange(
                    withAutomationActions(
                      draft,
                      actions.filter((item) => item.id !== action.id),
                    ),
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="block space-y-1 text-xs text-muted">
              <span>{t("automation.customActions.name")}</span>
              <input
                required
                maxLength={200}
                className="app-input w-full px-2 py-2"
                value={action.name}
                onChange={(event) =>
                  update(action.id, { name: event.target.value })
                }
              />
            </label>
            <label className="block space-y-1 text-xs text-muted">
              <span>{t("automation.customActions.description")}</span>
              <textarea
                maxLength={2000}
                rows={2}
                className="app-input w-full px-2 py-2"
                value={action.description}
                onChange={(event) =>
                  update(action.id, { description: event.target.value })
                }
              />
            </label>
            <label className="block space-y-1 text-xs text-muted">
              <span>{t("automation.customActions.script")}</span>
              <select
                required
                className="app-input w-full px-2 py-2"
                value={action.script}
                onChange={(event) =>
                  update(action.id, { script: event.target.value })
                }
              >
                <option value="">
                  {t("automation.customActions.chooseScript")}
                </option>
                {scripts.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.path}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="app-button-secondary"
              onClick={() => {
                const extension =
                  draft.files?.some((file) => file.path.endsWith(".ps1")) ||
                  draft.content.startsWith("& ")
                    ? "ps1"
                    : "sh";
                const path = `scripts/actions/${action.id}.${extension}`;
                const updated = withAutomationActions(
                  draft,
                  actions.map((item) =>
                    item.id === action.id ? { ...item, script: path } : item,
                  ),
                );
                onChange({
                  files: [
                    ...(updated.files ?? []),
                    {
                      path,
                      content:
                        "# Define this operation before running it.\nexit 1\n",
                    },
                  ],
                });
              }}
              disabled={!!action.script}
            >
              {t("automation.customActions.newScript")}
            </button>
            <label className="block space-y-1 text-xs text-muted">
              <span>{t("automation.customActions.arguments")}</span>
              <textarea
                rows={2}
                className="app-input w-full px-2 py-2 font-mono"
                value={action.arguments.join("\n")}
                onChange={(event) =>
                  update(action.id, {
                    arguments: event.target.value
                      ? event.target.value.split("\n")
                      : [],
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={action.preview_arguments !== undefined}
                onChange={(event) =>
                  update(action.id, {
                    preview_arguments: event.target.checked
                      ? ["--preview"]
                      : undefined,
                  })
                }
              />
              {t("automation.customActions.enablePreview")}
            </label>
            {action.preview_arguments !== undefined && (
              <label className="block space-y-1 text-xs text-muted">
                <span>{t("automation.customActions.previewArguments")}</span>
                <textarea
                  className="app-input w-full px-2 py-2 font-mono"
                  rows={2}
                  value={action.preview_arguments.join("\n")}
                  onChange={(event) =>
                    update(action.id, {
                      preview_arguments: event.target.value
                        ? event.target.value.split("\n")
                        : [],
                    })
                  }
                />
              </label>
            )}
            <label className="block space-y-1 text-xs text-muted">
              <span>{t("automation.customActions.confirmation")}</span>
              <textarea
                maxLength={2000}
                rows={2}
                placeholder={t("automation.customActions.confirmationHint")}
                className="app-input w-full px-2 py-2"
                value={action.confirmation}
                onChange={(event) =>
                  update(action.id, { confirmation: event.target.value })
                }
              />
            </label>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={disabled || invalid || actions.length >= 12}
          className="app-button-secondary"
          onClick={() =>
            onChange(
              withAutomationActions(draft, [
                ...actions,
                {
                  id: `action_${crypto.randomUUID().replaceAll("-", "")}`,
                  name: "",
                  description: "",
                  script: "",
                  arguments: [],
                  confirmation: "",
                },
              ]),
            )
          }
        >
          <Plus className="h-3.5 w-3.5" />
          {t("automation.customActions.add")}
        </button>
      </div>
    </details>
  );
}
