import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationScriptFile } from "../lib/tauri";
import { FileReaderDialog } from "./file-reader";
import { openFileInVscode } from "../lib/openInVscode";

export function AutomationScriptFilesEditor({
  files,
  disabled,
  scriptDirectory,
  onChange,
}: {
  files: AutomationScriptFile[];
  disabled: boolean;
  scriptDirectory?: string | null;
  onChange: (files: AutomationScriptFile[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!files.length) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface p-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-medium text-primary">
          {t("automation.scriptFiles", { count: files.length })}
        </h3>
        <p className="mt-1 text-[12px] leading-6 text-muted">
          {t("automation.scriptFilesHint")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="app-button-secondary shrink-0"
      >
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        {t("fileReader.open")}
      </button>
      {open && (
        <FileReaderDialog
          title={t("automation.scriptFiles", { count: files.length })}
          description={t("automation.scriptFilesSaveHint")}
          files={files}
          onOpenInVscode={
            scriptDirectory
              ? (path) => openFileInVscode(scriptDirectory, path)
              : undefined
          }
          maxLength={65536}
          onContentChange={
            disabled
              ? undefined
              : (path, content) =>
                  onChange(
                    files.map((file) =>
                      file.path === path ? { ...file, content } : file,
                    ),
                  )
          }
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
