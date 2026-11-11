import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invalidAutomationVariables } from "../lib/automationPrompts";

type Variable = { name: string; value: string };

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
  const invalid = invalidAutomationVariables([
    { id: "current", name: "current", content: "", variables },
  ]);
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
          disabled={disabled}
          className="app-button-secondary"
          onClick={() => onChange([...variables, { name: "", value: "" }])}
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
      {invalid && (
        <p role="alert" className="text-xs text-danger">
          {t("automation.variablesInvalid")}
        </p>
      )}
    </section>
  );
}
