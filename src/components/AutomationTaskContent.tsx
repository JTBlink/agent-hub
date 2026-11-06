import { useTranslation } from "react-i18next";
import type { AutomationDraft } from "../lib/tauri";
import { automationPromptFile } from "../lib/automation";
import { AutomationPromptEditor } from "./AutomationPromptEditor";
import { PROMPT_VARIANTS_PATH } from "../lib/automationPrompts";
import { AutomationScriptFilesEditor } from "./AutomationScriptFilesEditor";

export function AutomationTaskContent({
  draft,
  busy,
  inactivePrompt = "",
  scriptDirectory,
  onChange,
}: {
  draft: AutomationDraft;
  busy: boolean;
  inactivePrompt?: string;
  scriptDirectory?: string | null;
  onChange: (value: Partial<AutomationDraft>) => void;
}) {
  const { t } = useTranslation();
  const promptFile = automationPromptFile(draft);
  const usesAgent = !!promptFile || draft.provider === "hermes";
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">
          {t("automation.command")}
        </span>
        <textarea
          aria-label={t("automation.command")}
          required={!usesAgent}
          disabled={busy}
          readOnly={usesAgent}
          maxLength={65536}
          rows={!usesAgent && draft.content.includes("\n") ? 4 : 1}
          value={
            draft.provider === "hermes"
              ? t("automation.hermesCommand")
              : draft.content
          }
          onChange={(event) => onChange({ content: event.target.value })}
          placeholder={t("automation.commandPlaceholder")}
          className="app-input min-h-[42px] w-full resize-y px-3 py-2.5 font-mono text-xs leading-6 read-only:bg-bg-secondary read-only:text-muted"
        />
      </label>
      <AutomationPromptEditor
        draft={draft}
        disabled={busy}
        inactivePrompt={inactivePrompt}
        usesAgent={usesAgent}
        onChange={onChange}
      />
      <p className="text-xs leading-6 text-muted">
        {t(
          usesAgent
            ? "automation.agentPromptHelp"
            : "automation.inactivePromptHelp",
        )}
      </p>
      <AutomationScriptFilesEditor
        scriptDirectory={scriptDirectory}
        files={(draft.files ?? []).filter(
          (file) =>
            file.path !== promptFile?.path &&
            file.path !== PROMPT_VARIANTS_PATH,
        )}
        disabled={busy}
        onChange={(files) =>
          onChange({
            files: draft.files?.map(
              (file) =>
                files.find((updated) => updated.path === file.path) ?? file,
            ),
          })
        }
      />
    </>
  );
}
