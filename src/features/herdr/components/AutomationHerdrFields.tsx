import { useId } from "react";
import { useTranslation } from "react-i18next";
import { automationAgentConfig } from "../../../lib/automation";
import type { AutomationDraft } from "../../../lib/tauri";

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
  const argumentsHelpId = useId();
  const timeoutHelpId = useId();
  const config = automationAgentConfig(draft);
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
  const runner = config.value.runner;
  const launch = config.value.launch;
  const execution = config.value.execution;
  return (
    <>
      <label className="block space-y-2">
        <span className="text-xs font-medium text-muted">
          {t("automation.extraAgentArguments")}
        </span>
        <textarea
          className="app-input w-full resize-y font-mono text-xs"
          aria-label={t("automation.extraAgentArguments")}
          aria-describedby={argumentsHelpId}
          disabled={disabled}
          rows={3}
          spellCheck={false}
          placeholder={t("automation.extraAgentArgumentsPlaceholder")}
          value={launch.arguments.join("\n")}
          onChange={(event) =>
            update({
              launch: {
                ...launch,
                arguments: event.target.value.split("\n").filter(Boolean),
              },
            })
          }
        />
        <span
          id={argumentsHelpId}
          className="block text-xs leading-5 text-muted"
        >
          {t("automation.extraAgentArgumentsHelp")}
        </span>
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium text-muted">
          {t("automation.herdrSession")}
        </span>
        <input
          className="app-input w-full"
          aria-label={t("automation.herdrSession")}
          disabled={disabled}
          value={runner.session}
          onChange={(event) =>
            update({ runner: { ...runner, session: event.target.value } })
          }
        />
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium text-muted">
          {t("automation.agentWaitTimeout")}
        </span>
        <input
          className="app-input w-full"
          aria-label={t("automation.agentWaitTimeout")}
          aria-describedby={timeoutHelpId}
          disabled={disabled}
          type="number"
          min={60}
          max={7200}
          step={60}
          value={execution.wait_timeout_seconds}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            if (Number.isInteger(seconds))
              update({
                execution: { ...execution, wait_timeout_seconds: seconds },
              });
          }}
        />
        <span id={timeoutHelpId} className="block text-xs leading-5 text-muted">
          {t("automation.agentWaitTimeoutHelp")}
        </span>
      </label>
    </>
  );
}
