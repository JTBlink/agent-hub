import { Check, ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AutomationVariableValueField } from "./AutomationVariableValueField";
import { AutomationVariableOptionsField } from "./AutomationVariableOptionsField";
import {
  type AutomationVariable,
  invalidAutomationVariables,
  isValidAutomationVariable,
} from "../lib/automationPrompts";
import { cn } from "../utils";

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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (index: number) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(index)) next.add(index);
      return next;
    });
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
      {variables.map((variable, index) => {
        const open = expanded.has(index);
        return (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-border-subtle p-2"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                aria-expanded={open}
                aria-label={t(
                  open
                    ? "automation.collapseVariable"
                    : "automation.expandVariable",
                  { index: index + 1 },
                )}
                title={t(
                  open
                    ? "automation.collapseVariable"
                    : "automation.expandVariable",
                  { index: index + 1 },
                )}
                className="app-button-ghost mt-1.5 shrink-0 rounded-md p-1 text-muted hover:text-secondary"
                onClick={() => toggle(index)}
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4 transition-transform",
                    open && "rotate-90",
                  )}
                />
              </button>
              <input
                aria-label={t("automation.variableName", { index: index + 1 })}
                disabled={disabled}
                value={variable.name}
                maxLength={128}
                className="app-input min-w-0 flex-1 font-mono text-xs"
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
              <AutomationVariableValueField
                variable={variable}
                index={index + 1}
                disabled={disabled}
                onChange={(value) => update(index, { value })}
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={t("automation.removeVariable", {
                  index: index + 1,
                })}
                className="app-button-secondary"
                onClick={() => {
                  onChange(variables.filter((_, at) => at !== index));
                  setExpanded(
                    (previous) =>
                      new Set(
                        [...previous].flatMap((at) =>
                          at === index ? [] : [at > index ? at - 1 : at],
                        ),
                      ),
                  );
                }}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            {!open && variable.description && (
              <p
                className="truncate pl-8 text-xs text-muted"
                title={variable.description}
              >
                {variable.description}
              </p>
            )}
            <div hidden={!open} className="space-y-3 pl-8">
              <textarea
                aria-label={t("automation.variableDescription", {
                  index: index + 1,
                })}
                placeholder={t("automation.variableDescriptionPlaceholder")}
                disabled={disabled}
                value={variable.description ?? ""}
                maxLength={2000}
                rows={2}
                className="app-input w-full resize-y text-xs"
                onChange={(event) =>
                  update(index, {
                    description: event.target.value || undefined,
                  })
                }
              />
              <AutomationVariableOptionsField
                variable={variable}
                index={index + 1}
                disabled={disabled}
                onChange={(options) => update(index, { options })}
              />
            </div>
          </div>
        );
      })}
      {draft && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-start gap-2">
            <input
              aria-label={t("automation.variableName", {
                index: variables.length + 1,
              })}
              disabled={disabled}
              autoFocus
              placeholder={t("automation.variableNamePlaceholder")}
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
            <AutomationVariableValueField
              variable={draft}
              index={variables.length + 1}
              placeholder={t("automation.variableDefaultValuePlaceholder")}
              disabled={disabled}
              onChange={(value) => setDraft({ ...draft, value })}
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
          <AutomationVariableOptionsField
            variable={draft}
            index={variables.length + 1}
            disabled={disabled}
            onChange={(options) => setDraft({ ...draft, options })}
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
