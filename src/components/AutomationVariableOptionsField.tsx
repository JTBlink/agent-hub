import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  automationVariableOptions,
  type AutomationVariable,
} from "../lib/automationPrompts";

export function AutomationVariableOptionsField({
  variable,
  index,
  disabled,
  onChange,
  initiallyExpanded = false,
}: {
  variable: AutomationVariable;
  index: number;
  disabled: boolean;
  onChange: (options: string[]) => void;
  initiallyExpanded?: boolean;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState("");
  const options = automationVariableOptions(variable);
  const add = (text = pending) => {
    if (disabled) return;
    const additions = text
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!additions.length) return;
    onChange([...new Set([...options, ...additions])]);
    setPending("");
  };
  return (
    <details
      open={initiallyExpanded}
      className="order-last w-full text-xs text-muted"
    >
      <summary className="cursor-pointer">
        {t("automation.variableOptionsTitle")}
      </summary>
      <p className="my-2 leading-5">{t("automation.variableOptionsHelp")}</p>
      {options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {options.map((option) => (
            <span
              key={option}
              className="inline-flex max-w-full items-center gap-1 rounded border border-border-subtle bg-surface px-2 py-1 text-secondary"
            >
              <span className="min-w-0 break-all font-mono">
                {option || t("automation.variableEmptyValue")}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={t("automation.removeVariableOption", {
                  value: option || t("automation.variableEmptyValue"),
                })}
                className="app-button-ghost shrink-0 p-0.5"
                onClick={() =>
                  onChange(options.filter((value) => value !== option))
                }
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          aria-label={t("automation.variableOptions", { index })}
          placeholder={t("automation.variableOptionPlaceholder")}
          disabled={disabled}
          className="app-input min-w-0 flex-1 font-mono text-xs"
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onBlur={() => add()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              add();
            }
            if (event.key === "Escape" && pending) {
              event.preventDefault();
              event.stopPropagation();
              setPending("");
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[\r\n]/.test(text)) {
              event.preventDefault();
              add([pending, text].filter(Boolean).join("\n"));
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || !pending.trim()}
          className="app-button-secondary h-8 shrink-0"
          aria-label={t("automation.addVariableOption")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => add()}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          {t("automation.addVariableOption")}
        </button>
      </div>
    </details>
  );
}
