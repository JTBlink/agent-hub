import { useState } from "react";
import { FileCode2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationTask } from "../lib/tauri";
import { openFileInVscode } from "../lib/openInVscode";
import { FileReaderDialog } from "./file-reader";

export function AutomationTaskSource({ task }: { task: AutomationTask }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const files = task.definition?.files ?? [];
  const directory = task.definition?.script_dir ?? task.definition?.workdir;
  if (!files.length) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t("automation.viewSource")}
        title={t("automation.viewSource")}
        onClick={() => setOpen(true)}
        className="app-button-ghost shrink-0 rounded-md p-1.5 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FileCode2 aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        <FileReaderDialog
          initialMaximized
          title={`${task.name} · ${t("automation.viewSource")}`}
          files={files}
          initialPath={
            files.find((file) => /^(scripts\/)?run\.sh$/.test(file.path))?.path
          }
          onOpenInVscode={
            directory ? (path) => openFileInVscode(directory, path) : undefined
          }
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
