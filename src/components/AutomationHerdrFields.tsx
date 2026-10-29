import { useId } from "react";
import { useTranslation } from "react-i18next";
import { automationHerdrConfig } from "../lib/automation";
import type { AutomationDraft } from "../lib/tauri";

export function AutomationHerdrFields({
  draft,
  disabled,
  onChange,
}: {
  draft: AutomationDraft;
  disabled: boolean;
  onChange: (value: Partial<AutomationDraft>) => void;
}) {
  const { t } = useTranslation();
  const helpId = useId();
  const config = automationHerdrConfig(draft);
  if (!config) return null;
  const update = (value: object) =>
    onChange({
      files: draft.files?.map((file) =>
        file.path === config.file.path
          ? {
              ...file,
              content:
                JSON.stringify({ ...config.value, ...value }, null, 2) + "\n",
            }
          : file,
      ),
    });
  return (
    <>
      <label className="block space-y-2">
        <span className="text-[12px] font-medium text-muted">
          {t("automation.extraAgentArguments")}
        </span>
        <textarea
          className="app-input w-full resize-y font-mono text-[12px]"
          aria-label={t("automation.extraAgentArguments")}
          aria-describedby={helpId}
          disabled={disabled}
          rows={3}
          spellCheck={false}
          placeholder={t("automation.extraAgentArgumentsPlaceholder")}
          value={
            "extra_arguments" in config.value &&
            typeof config.value.extra_arguments === "string"
              ? config.value.extra_arguments
              : ""
          }
          onChange={(event) => update({ extra_arguments: event.target.value })}
        />
        <span id={helpId} className="block text-[11px] leading-5 text-muted">
          {t("automation.extraAgentArgumentsHelp")}
        </span>
      </label>
      <label className="block space-y-2">
        <span className="text-[12px] font-medium text-muted">
          {t("automation.herdrSession")}
        </span>
        <input
          className="app-input w-full"
          aria-label={t("automation.herdrSession")}
          disabled={disabled}
          value={
            "session" in config.value &&
            typeof config.value.session === "string"
              ? config.value.session
              : "default"
          }
          onChange={(event) => update({ session: event.target.value })}
        />
      </label>
    </>
  );
}
