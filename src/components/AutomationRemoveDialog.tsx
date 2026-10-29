import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AutomationTask } from "../lib/tauri";
import { ConfirmDialog } from "./ConfirmDialog";

export function AutomationRemoveDialog({
  task,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  task: AutomationTask;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (deleteLocalData: boolean) => Promise<void | false>;
}) {
  const { t } = useTranslation();
  const [deleteLocalData, setDeleteLocalData] = useState(false);
  const helpId = useId();
  const owned = task.origin === "agent_hub";
  return (
    <ConfirmDialog
      open
      title={t("automation.remove")}
      message={t("automation.removeConfirm", { name: task.name })}
      onClose={onClose}
      onConfirm={() => onConfirm(owned && deleteLocalData)}
    >
      {owned && (
        <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-secondary p-3">
          <label className="flex items-start gap-2 text-[13px] text-primary">
            <input
              type="checkbox"
              checked={deleteLocalData}
              disabled={busy}
              onChange={(event) => setDeleteLocalData(event.target.checked)}
              aria-describedby={helpId}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            />
            {t("automation.deleteLocalData")}
          </label>
          <p id={helpId} className="text-[12px] leading-relaxed text-tertiary">
            {t("automation.deleteLocalDataHelp")}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
