import { useTranslation } from "react-i18next";
import { useRef, type KeyboardEventHandler } from "react";
import {
  automationVariableOptions,
  type AutomationVariable,
} from "../lib/automationPrompts";
import { ThemedSelect } from "./ThemedSelect";
import { cn } from "../utils";

/** Keep free input alongside the shared, theme-aware single-choice menu. */
export function AutomationVariableValueField({
  variable,
  index,
  disabled,
  onChange,
  onKeyDown,
  placeholder,
}: {
  variable: AutomationVariable;
  index: number;
  disabled: boolean;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const field = useRef<HTMLDivElement>(null);
  const options = automationVariableOptions(variable);
  const choices = options.includes(variable.value)
    ? options
    : [variable.value, ...options];
  return (
    <div ref={field} className="flex min-w-0 flex-1">
      <input
        aria-label={t("automation.variableValue", { index })}
        disabled={disabled}
        value={variable.value}
        placeholder={placeholder}
        className={cn(
          "app-input min-w-0 flex-1 text-xs",
          options.length > 0 && "rounded-r-none border-r-0",
        )}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {options.length > 0 && (
        <ThemedSelect
          aria-label={t("automation.variableValueChoices", { index })}
          value={variable.value}
          disabled={disabled}
          className="w-10 gap-0 rounded-l-none px-2 text-xs"
          menuAnchorRef={field}
          renderValue={() => null}
          onChange={(event) => onChange(event.target.value)}
        >
          {choices.map((option) => (
            <option key={option} value={option}>
              {option || t("automation.variableEmptyValue")}
            </option>
          ))}
        </ThemedSelect>
      )}
    </div>
  );
}
