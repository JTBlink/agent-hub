import { useTranslation } from "react-i18next";
import type { AutomationDraft } from "../lib/tauri";
import { automationPromptFile } from "../lib/automation";
import { AutomationScriptFilesEditor } from "./AutomationScriptFilesEditor";

export function AutomationTaskContent({
  draft,
  busy,
  inactivePrompt = "",
  onChange,
}: {
  draft: AutomationDraft;
  busy: boolean;
  inactivePrompt?: string;
  onChange: (value: Partial<AutomationDraft>) => void;
}) {
  const { t } = useTranslation();
  const promptFile = automationPromptFile(draft);
  const usesAgent = !!promptFile || draft.provider === "hermes";
  const prompt =
    promptFile?.content ??
    (draft.provider === "hermes" ? draft.content : inactivePrompt);
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-muted">
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
          className="app-input min-h-[42px] w-full resize-y px-3 py-2.5 font-mono text-[12px] leading-6 read-only:bg-bg-secondary read-only:text-muted"
        />
      </label>
      <label className="flex min-h-[300px] flex-1 flex-col gap-3 md:min-h-[380px]">
        <span className="text-[12px] font-medium text-muted">
          {t("automation.prompt")}
        </span>
        <textarea
          aria-label={t("automation.prompt")}
          required={usesAgent}
          disabled={busy || !usesAgent}
          maxLength={65536}
          value={prompt}
          onChange={(event) =>
            promptFile
              ? onChange({
                  files: draft.files?.map((file) =>
                    file.path === promptFile.path
                      ? { ...file, content: event.target.value }
                      : file,
                  ),
                })
              : onChange({ content: event.target.value })
          }
          placeholder={t(
            usesAgent
              ? "automation.agentPromptPlaceholder"
              : "automation.chooseAgentPrompt",
          )}
          className="app-input min-h-[280px] w-full flex-1 resize-y p-5 text-[13px] leading-7 disabled:cursor-not-allowed disabled:bg-bg-secondary disabled:text-muted"
        />
      </label>
      <p className="text-[12px] leading-6 text-muted">
        {t(
          usesAgent
            ? "automation.agentPromptHelp"
            : "automation.inactivePromptHelp",
        )}
      </p>
      <AutomationScriptFilesEditor
        files={(draft.files ?? []).filter(
          (file) => file.path !== promptFile?.path,
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
