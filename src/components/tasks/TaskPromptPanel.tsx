import { useTranslation } from "react-i18next";

export function TaskPromptPanel({
  prompt,
  template,
  disabled,
  onTemplateChange,
}: {
  prompt: string;
  template: string;
  disabled: boolean;
  onTemplateChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-3">
      <label className="block space-y-2">
        <span className="text-sm font-medium">
          {t("tasks.launch.promptPreview")}
        </span>
        <textarea
          readOnly
          aria-label={t("herdr.initialTask")}
          value={prompt}
          className="app-input h-[calc(55vh/var(--app-scale))] min-h-80 w-full resize-y whitespace-pre-wrap break-words font-mono text-xs leading-6"
        />
      </label>
      <details>
        <summary className="cursor-pointer text-xs text-muted">
          {t("tasks.launch.editTemplate")}
        </summary>
        <label className="mt-2 block space-y-2 text-xs">
          <span>{t("tasks.launch.templateHint")}</span>
          <textarea
            aria-label={t("tasks.launch.promptTemplate")}
            className="app-input min-h-40 w-full resize-y text-xs leading-6"
            value={template}
            disabled={disabled}
            onChange={(event) => onTemplateChange(event.target.value)}
          />
        </label>
      </details>
    </div>
  );
}
