import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AutomationVariable,
  invalidAutomationVariables,
  isValidAutomationVariable,
} from "../lib/automationPrompts";

type Variable = AutomationVariable;

export function AutomationVariablesField({
  variables,
  disabled,
  onChange,
}: {
  variables: Variable[];
  disabled: boolean;
  onChange: (variables: Variable[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Variable | null>(null);
  const [draftSubmitted, setDraftSubmitted] = useState(false);
  const invalid = invalidAutomationVariables([
    { id: "current", name: "current", content: "", variables },
  ]);
  const draftInvalid =
    draft !== null &&
    !isValidAutomationVariable(
      draft,
      new Set(variables.map((variable) => variable.name)),
    );
  const commitDraft = () => {
    if (!draft) return;
    setDraftSubmitted(true);
    if (draftInvalid) return;
    onChange([...variables, draft]);
    setDraft(null);
    setDraftSubmitted(false);
  };
  const cancelDraft = () => {
    setDraft(null);
    setDraftSubmitted(false);
  };
  const update = (index: number, change: Partial<Variable>) =>
    onChange(
      variables.map((variable, at) =>
        at === index ? { ...variable, ...change } : variable,
      ),
    );
  return (
    <section className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-medium text-muted">
          {t("automation.customVariables")}
        </h4>
        <button
          type="button"
          disabled={disabled || draft !== null}
          className="app-button-secondary disabled:cursor-not-allowed"
          onClick={() => {
            setDraft({ name: "", value: "" });
            setDraftSubmitted(false);
          }}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          {t("automation.addVariable")}
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">
        {t("automation.customVariablesHelp")}
      </p>
      {variables.map((variable, index) => (
        <div key={index} className="flex flex-wrap items-start gap-2">
          <input
            aria-label={t("automation.variableName", { index: index + 1 })}
            disabled={disabled}
            value={variable.name}
            maxLength={128}
            className="app-input min-w-0 flex-1 font-mono text-xs"
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <input
            aria-label={t("automation.variableValue", { index: index + 1 })}
            disabled={disabled}
            value={variable.value}
            className="app-input min-w-0 flex-1 text-xs"
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <textarea
            aria-label={t("automation.variableDescription", {
              index: index + 1,
            })}
            placeholder={t("automation.variableDescriptionPlaceholder")}
            disabled={disabled}
            value={variable.description ?? ""}
            maxLength={2000}
            rows={2}
            className="app-input order-last w-full resize-y text-xs"
            onChange={(event) =>
              update(index, { description: event.target.value || undefined })
            }
          />
          <button
            type="button"
            disabled={disabled}
            aria-label={t("automation.removeVariable", { index: index + 1 })}
            className="app-button-secondary"
            onClick={() => onChange(variables.filter((_, at) => at !== index))}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
      {draft && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-start gap-2">
            <input
              aria-label={t("automation.variableName", {
                index: variables.length + 1,
              })}
              disabled={disabled}
              autoFocus
              value={draft.name}
              maxLength={128}
              className="app-input min-w-0 flex-1 font-mono text-xs"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  commitDraft();
                }
                if (event.key === "Escape") cancelDraft();
              }}
            />
            <input
              aria-label={t("automation.variableValue", {
                index: variables.length + 1,
              })}
              disabled={disabled}
              value={draft.value}
              className="app-input min-w-0 flex-1 text-xs"
              onChange={(event) =>
                setDraft({ ...draft, value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  commitDraft();
                }
                if (event.key === "Escape") cancelDraft();
              }}
            />
            <button
              type="button"
              disabled={disabled}
              aria-label={t("automation.confirmVariable")}
              title={t("automation.confirmVariable")}
              className="app-button-ghost shrink-0 rounded-md p-2 text-emerald-500 hover:text-emerald-400 disabled:cursor-not-allowed"
              onClick={commitDraft}
            >
              <Check aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label={t("automation.cancelVariable")}
              title={t("automation.cancelVariable")}
              className="app-button-ghost shrink-0 rounded-md p-2 text-muted hover:text-secondary disabled:cursor-not-allowed"
              onClick={cancelDraft}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <textarea
            aria-label={t("automation.variableDescription", {
              index: variables.length + 1,
            })}
            placeholder={t("automation.variableDescriptionPlaceholder")}
            disabled={disabled}
            value={draft.description ?? ""}
            maxLength={2000}
            rows={2}
            className="app-input w-full resize-y text-xs"
            onChange={(event) =>
              setDraft({
                ...draft,
                description: event.target.value || undefined,
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelDraft();
              if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                commitDraft();
              }
            }}
          />
          <p className="text-xs text-muted">
            {t("automation.variableDraftHelp")}
          </p>
          {draftSubmitted && draftInvalid && (
            <p role="alert" className="text-xs text-danger">
              {t("automation.variablesInvalid")}
            </p>
          )}
        </div>
      )}
      {invalid && (
        <p role="alert" className="text-xs text-danger">
          {t("automation.variablesInvalid")}
        </p>
      )}
    </section>
  );
}
