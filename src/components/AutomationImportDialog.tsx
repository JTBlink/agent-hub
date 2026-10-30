import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "./ConfirmDialog";
import { AutomationProjectField } from "./AutomationProjectField";
import {
  previewAutomationPackage,
  importAutomationPackage,
  type AutomationPackage,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function AutomationImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<AutomationPackage | null>(null);
  const [workdir, setWorkdir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const choose = async (directory: boolean) => {
    const attempt = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const path = await open({
        directory,
        multiple: false,
        filters: directory
          ? undefined
          : [{ name: "JSON", extensions: ["json"] }],
      });
      if (attempt !== generation.current) return;
      if (typeof path !== "string") return;
      setPreview(null);
      const result = await previewAutomationPackage(path);
      if (attempt !== generation.current) return;
      setPreview(result);
    } catch (cause) {
      if (attempt === generation.current)
        setError(getErrorMessage(cause, t("automation.actionFailed")));
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open
      title={t("automation.importPackage")}
      message={t("automation.importPackageHelp")}
      tone="warning"
      confirmLabel={t("automation.importPackage")}
      confirmDisabled={!preview || busy}
      onClose={onClose}
      onConfirm={async () => {
        if (!preview || busy) return false;
        setBusy(true);
        setError(null);
        try {
          onImported(await importAutomationPackage(preview, workdir));
        } catch (cause) {
          setError(getErrorMessage(cause, t("automation.actionFailed")));
          return false;
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="app-button-secondary"
            onClick={() => void choose(false)}
          >
            {t("automation.importFile")}
          </button>
          <button
            type="button"
            disabled={busy}
            className="app-button-secondary"
            onClick={() => void choose(true)}
          >
            {t("automation.importFolder")}
          </button>
        </div>
        {preview && (
          <>
            <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] text-secondary">
              <p className="font-medium text-primary">{preview.draft.name}</p>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words">
                {preview.draft.content}
              </pre>
              <p>
                {t("automation.packageFileCount", {
                  count: preview.draft.files?.length ?? 0,
                })}
              </p>
              <details>
                <summary>{t("automation.scriptFiles")}</summary>
                <ul>
                  {preview.draft.files?.map((file) => (
                    <li key={file.path}>{file.path}</li>
                  ))}
                </ul>
              </details>
            </div>
            <AutomationProjectField
              value={workdir}
              disabled={busy}
              onChange={setWorkdir}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
