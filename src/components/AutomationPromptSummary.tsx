import { Check } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AutomationTask } from "../lib/tauri";
import { automationPrompts } from "../lib/automationPrompts";

export function AutomationPromptSummary({
  task,
  busy = false,
  onSelect,
  onEdit,
}: {
  task: AutomationTask;
  busy?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const group = useId();
  const prompts = task.definition
    ? automationPrompts(task.definition, t("automation.defaultPromptVariant"))
    : null;
  const blocked =
    busy || !task.can_edit || task.status === "running" || prompts?.invalid;
  return (
    <section
      className="overflow-hidden rounded-lg border border-border-subtle bg-surface"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
        <h2 className="text-sm font-semibold text-secondary">
          {t("automation.prompt")}
        </h2>
        {onEdit && (
          <button
            type="button"
            disabled={busy || !task.can_edit || task.status === "running"}
            className="app-button-secondary text-xs"
            onClick={onEdit}
          >
            {t("automation.managePromptVariants")}
          </button>
        )}
      </div>
      <div className="space-y-4 px-5 py-4">
        {prompts?.invalid && (
          <p role="alert" className="text-sm text-danger">
            {t("automation.promptVariantsInvalid")}
          </p>
        )}
        {prompts && !prompts.invalid && (
          <fieldset disabled={!!blocked || !onSelect}>
            <legend className="mb-2 text-xs text-muted">
              {t("automation.promptVariants")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {prompts.variants.map((variant) => (
                <label
                  key={variant.id}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md focus-within:ring-2 focus-within:ring-accent border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-secondary"
                >
                  <input
                    type="radio"
                    name={group}
                    value={variant.id}
                    checked={variant.id === prompts.activeId}
                    onChange={() => onSelect?.(variant.id)}
                    className="peer sr-only"
                  />
                  <span className="break-all">{variant.name}</span>
                  <Check
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-success opacity-0 peer-checked:opacity-100"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {t(
                task.status === "running"
                  ? "automation.promptVariantsRunning"
                  : "automation.promptVariantsHint",
              )}
            </p>
          </fieldset>
        )}
        <p className="max-w-[90ch] whitespace-pre-wrap break-words text-sm leading-7 text-secondary">
          {task.prompt}
        </p>
      </div>
    </section>
  );
}
