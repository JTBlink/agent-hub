import { useTranslation } from "react-i18next";
import type { AutomationScriptFile } from "../lib/tauri";

export function AutomationScriptFilesEditor({
  files,
  disabled,
  onChange,
}: {
  files: AutomationScriptFile[];
  disabled: boolean;
  onChange: (files: AutomationScriptFile[]) => void;
}) {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <details className="rounded-lg border border-border-subtle bg-surface p-4">
      <summary className="cursor-pointer text-[13px] font-medium text-primary focus-visible:ring-2 focus-visible:ring-accent">
        {t("automation.scriptFiles", { count: files.length })}
      </summary>
      <p className="mt-3 text-[12px] leading-6 text-muted">
        {t("automation.scriptFilesHint")}
      </p>
      {files.map((file, index) => (
        <label key={file.path} className="mt-4 block space-y-2">
          <span className="break-all font-mono text-[12px] text-secondary">
            {file.path}
          </span>
          <textarea
            aria-label={file.path}
            disabled={disabled}
            required
            value={file.content}
            maxLength={65536}
            onChange={(event) =>
              onChange(
                files.map((value, position) =>
                  position === index
                    ? { ...value, content: event.target.value }
                    : value,
                ),
              )
            }
            className="app-input min-h-[260px] w-full resize-y p-3 font-mono text-[12px] leading-6"
          />
        </label>
      ))}
    </details>
  );
}
