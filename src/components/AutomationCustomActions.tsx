import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AutomationTask, AutomationActionPreview } from "../lib/tauri";
import {
  automationActions,
  type AutomationAction,
} from "../lib/automationActions";
import { ConfirmDialog } from "./ConfirmDialog";

export function AutomationCustomActions({
  task,
  busy,
  onExecute,
  onPreview,
}: {
  task: AutomationTask;
  busy: boolean;
  onExecute: (action: AutomationAction, token?: string) => Promise<boolean>;
  onPreview: (
    action: AutomationAction,
  ) => Promise<AutomationActionPreview | null>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<AutomationAction | null>(null);
  const [preview, setPreview] = useState<AutomationActionPreview | null>(null);
  const [preparing, setPreparing] = useState(false);
  if (!task.is_package || !task.definition || task.origin !== "agent_hub")
    return null;
  const { actions, invalid } = automationActions(task.definition);
  if (invalid || !actions.length) return null;
  const blocked =
    busy || preparing || task.status === "running" || !task.can_run;
  const choose = async (action: AutomationAction) => {
    if (blocked) return;
    setPreview(null);
    if (action.preview_arguments) {
      setPreparing(true);
      try {
        const result = await onPreview(action);
        if (!result) return;
        setPreview(result);
        setConfirming(action);
      } finally {
        setPreparing(false);
      }
    } else if (action.confirmation) setConfirming(action);
    else await onExecute(action);
  };
  const button = (action: AutomationAction) => (
    <button
      key={action.id}
      type="button"
      className="app-button-secondary"
      disabled={blocked}
      title={action.description || action.name}
      onClick={() => void choose(action)}
    >
      {action.name}
    </button>
  );
  return (
    <>
      {actions.length <= 2 ? (
        actions.map(button)
      ) : (
        <details className="relative">
          <summary className="app-button-secondary cursor-pointer">
            {t("automation.customActions.more")}
          </summary>
          <div className="absolute right-0 top-full z-10 mt-1 flex min-w-48 flex-col gap-1 rounded-lg border border-border bg-surface p-2 shadow-card">
            {actions.map(button)}
          </div>
        </details>
      )}
      <ConfirmDialog
        size={preview ? "lg" : "sm"}
        open={confirming !== null}
        title={confirming?.name}
        message={preview?.summary || confirming?.confirmation || ""}
        confirmLabel={confirming?.name}
        confirmDisabled={blocked}
        tone="warning"
        onClose={() => {
          setConfirming(null);
          setPreview(null);
        }}
        onConfirm={async () => {
          if (confirming && (await onExecute(confirming, preview?.token))) {
            setConfirming(null);
            setPreview(null);
          } else {
            setConfirming(null);
            setPreview(null);
            return false;
          }
        }}
      >
        {preview && (
          <div className="max-h-[50vh] space-y-3 overflow-auto text-xs text-secondary">
            {confirming?.confirmation && <p>{confirming.confirmation}</p>}
            {!!preview.items.length && (
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="p-2">
                      {t("automation.customActions.item")}
                    </th>
                    <th className="p-2">
                      {t("automation.customActions.current")}
                    </th>
                    <th className="p-2">
                      {t("automation.customActions.after")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item, index) => (
                    <tr key={index} className="border-t border-border-subtle">
                      <td className="break-words p-2">{item.label}</td>
                      <td className="whitespace-pre-wrap break-words p-2">
                        {item.current}
                      </td>
                      <td className="whitespace-pre-wrap break-words p-2">
                        {item.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!!preview.preserved.length && (
              <div>
                <p className="font-medium">
                  {t("automation.customActions.preserved")}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.preserved.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
