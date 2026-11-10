import { FileCode2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AutomationTask } from "../lib/tauri";
import { openWorkspaceWindow } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function AutomationTaskSource({ task }: { task: AutomationTask }) {
  const { t } = useTranslation();
  const directory = task.definition?.script_dir ?? task.definition?.workdir;
  if (!directory) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t("automation.viewSource")}
        title={t("automation.viewSource")}
        onClick={async () => {
          try {
            await openWorkspaceWindow(directory);
          } catch (error) {
            toast.error(getErrorMessage(error, t("common.requestFailed")));
          }
        }}
        className="app-button-ghost shrink-0 rounded-md p-1.5 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FileCode2 aria-hidden="true" className="h-4 w-4" />
      </button>
    </>
  );
}
