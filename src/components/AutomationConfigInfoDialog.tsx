import { ExternalLink, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { openFileInVscode, openPathInVscode } from "../lib/openInVscode";
import { getAgentLaunchConfigPath } from "../lib/tauri";
import type { AutomationTask } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function AutomationConfigInfoDialog({
  tasks,
  onEdit,
  onClose,
}: {
  tasks: AutomationTask[];
  onEdit: (task: AutomationTask) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const close = useRef(onClose);
  const panel = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const configured = tasks.filter((task) =>
    task.definition?.files?.some((file) => file.path === "config/agent.json"),
  );
  const openGlobalConfig = async () => {
    try {
      await openPathInVscode(await getAgentLaunchConfigPath());
    } catch (cause) {
      setError(getErrorMessage(cause, String(cause)));
    }
  };
  const openTaskConfig = async (task: AutomationTask) => {
    const directory = task.definition?.script_dir;
    if (!directory) {
      setError(t("automation.configurationPathUnavailable"));
      return;
    }
    try {
      await openFileInVscode(directory, "config/agent.json");
    } catch (cause) {
      setError(getErrorMessage(cause, String(cause)));
    }
  };
  const openAgentSettings = () => {
    onClose();
    navigate("/settings#agents");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="automation-config-title"
        className="flex max-h-[calc(100vh/var(--app-scale)-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div>
            <h2 id="automation-config-title" className="text-lg font-semibold text-primary">
              {t("automation.configurationTitle")}
            </h2>
            <p className="mt-1 text-xs text-muted">{t("automation.configurationInfoHelp")}</p>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="app-button-ghost rounded-md p-1.5">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-6">
          <section className="rounded-xl border border-border-subtle bg-surface p-5">
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-primary">{t("automation.sharedAgentSettingsTitle")}</h3>
                <p className="mt-1 text-sm leading-6 text-secondary">{t("automation.sharedAgentSettingsHelp")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="app-button-primary" onClick={openAgentSettings}>
                    {t("automation.openAgentSettings")}
                  </button>
                  <button type="button" className="app-button-secondary" onClick={() => void openGlobalConfig()}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("automation.openGlobalConfigInVscode")}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section className="space-y-3">
            <div>
              <h3 className="font-medium text-primary">{t("automation.configurationTasks")}</h3>
              <p className="mt-1 text-xs text-muted">{t("automation.configurationTaskHelp")}</p>
            </div>
            {configured.length === 0 ? (
              <p className="text-sm text-muted">{t("automation.configurationNoTasks")}</p>
            ) : configured.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-3 py-2">
                <div className="min-w-0"><p className="truncate text-primary">{task.name}</p><p className="truncate font-mono text-xs text-muted">config/agent.json</p></div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="app-button-secondary" onClick={() => { onClose(); onEdit(task); }}>{t("automation.editConfiguration")}</button>
                  <button type="button" className="app-button-secondary" onClick={() => void openTaskConfig(task)}><ExternalLink className="h-3.5 w-3.5" />{t("automation.openConfigInVscode")}</button>
                </div>
              </div>
            ))}
          </section>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
