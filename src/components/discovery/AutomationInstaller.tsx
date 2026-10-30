import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { AutomationInstallSource } from "../../lib/automationDiscovery";
import { automationRequirements } from "../../lib/automationDiscovery";
import { formatAutomationSchedule } from "../../lib/automation";
import {
  importAutomationPackage,
  saveAutomation,
  setAutomationInstallation,
} from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import { AutomationProjectField } from "../AutomationProjectField";
import { AutomationScheduleInput } from "../AutomationScheduleInput";

export function AutomationInstaller({
  task,
  onClose,
}: {
  task: AutomationInstallSource;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [draft, setDraft] = useState({
    ...task.draft,
    enabled: false,
    script_dir: null,
    workdir: null,
  });
  const [workdir, setWorkdir] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const titleId = useId();
  useEffect(() => {
    alive.current = true;
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    return () => {
      alive.current = false;
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLElement>(
        step === 1 ? '[name="task-name"]' : "[data-heading]",
      )
      ?.focus();
  }, [step]);
  const viewTask = () => {
    onClose();
    navigate(`/automation?task=${encodeURIComponent(instanceId ?? "")}`);
  };
  const install = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      let id = instanceId;
      // Creation and installation are separate: retry the existing instance after partial failure.
      if (!id) {
        const intent = {
          ...draft,
          name: draft.name.trim(),
          enabled: false,
          workdir: null,
          script_dir: null,
        };
        id = task.package
          ? await importAutomationPackage(
              { ...task.package, draft: intent },
              workdir,
            )
          : await saveAutomation(null, null, { ...intent, workdir }, false);
        if (alive.current) setInstanceId(id);
      }
      await setAutomationInstallation(id, true);
      if (alive.current) setStep(2);
    } catch (cause) {
      if (alive.current)
        setError(getErrorMessage(cause, t("automation.actionFailed")));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const requirements = automationRequirements(task);
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
      className="m-auto max-h-[calc(100vh/var(--app-scale)_-_2rem)] w-[760px] max-w-[calc(100vw/var(--app-scale)_-_2rem)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-primary shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 0) setStep(1);
          else if (step === 1) void install();
        }}
        className="flex max-h-[calc(100vh/var(--app-scale)_-_2rem)] flex-col"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h2
              data-heading
              tabIndex={-1}
              id={titleId}
              className="text-[15px] font-semibold outline-none"
            >
              {t("automation.installPackage")}
            </h2>
            <p className="mt-1 break-words text-[12px] text-muted">
              {task.title} · {task.source}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={t("common.close")}
            className="app-button-ghost shrink-0"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>
        <ol
          aria-label={t("discovery.installSteps")}
          className="flex shrink-0 flex-wrap gap-4 border-b border-border-subtle bg-bg-secondary px-5 py-3 text-[12px] text-muted"
        >
          {["preview", "configure", "result"].map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={step === i ? "font-medium text-accent-light" : ""}
            >
              {i + 1}. {t(`discovery.${label}`)}
            </li>
          ))}
        </ol>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          {step === 0 && (
            <>
              <p className="text-[13px] text-secondary">{task.description}</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12px]">
                <dt className="text-muted">
                  {t("automation.columns.schedule")}
                </dt>
                <dd>{formatAutomationSchedule(draft.schedule, t)}</dd>
                <dt className="text-muted">{t("discovery.requirements")}</dt>
                <dd className="break-words">
                  {requirements.join(", ") ||
                    t("discovery.noExtraDependencies")}
                </dd>
              </dl>
              {task.requiresAdmin && (
                <p className="text-[12px] text-amber-700 dark:text-amber-400">
                  {t("discovery.requiresAdmin")}
                </p>
              )}
              <details>
                <summary className="cursor-pointer text-[13px] text-secondary">
                  {t("automation.command")}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-[12px]">
                  {draft.content}
                </pre>
              </details>
              <h3 className="text-[13px] font-medium">
                {t("automation.scriptFiles", {
                  count: draft.files?.length ?? 0,
                })}
              </h3>
              <div className="space-y-2">
                {draft.files?.map((file) => (
                  <details
                    key={file.path}
                    className="rounded-lg border border-border-subtle p-2"
                  >
                    <summary className="cursor-pointer break-all text-[12px]">
                      {file.path}
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[12px] text-secondary">
                      {file.content}
                    </pre>
                  </details>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <fieldset
                disabled={busy || !!instanceId}
                className="space-y-4 disabled:opacity-70"
              >
                <label className="block space-y-2">
                  <span className="text-[12px] text-secondary">
                    {t("automation.columns.name")}
                  </span>
                  <input
                    name="task-name"
                    required
                    maxLength={200}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    className="app-input w-full"
                  />
                </label>
                <AutomationProjectField
                  value={workdir}
                  disabled={busy || !!instanceId}
                  onChange={setWorkdir}
                />
                <AutomationScheduleInput
                  schedule={draft.schedule}
                  provider={draft.provider}
                  onChange={(schedule) => setDraft({ ...draft, schedule })}
                />
              </fieldset>
              <p className="rounded-lg border border-accent-border bg-accent-bg p-3 text-[12px] leading-6 text-secondary">
                {t("discovery.pausedInstall")}
              </p>
              {!!instanceId && !!error && (
                <p className="text-[12px] text-muted">
                  {t("discovery.retryExisting")}
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <div role="status" className="space-y-3 py-7 text-center">
              <Check
                aria-hidden="true"
                className="mx-auto h-9 w-9 text-emerald-600 dark:text-emerald-400"
              />
              <h3 className="text-lg font-semibold">
                {t("discovery.installedPaused")}
              </h3>
              <p className="text-[13px] text-muted">
                {t("discovery.installedHelp")}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="break-words text-[13px] text-danger">
              {error}
            </p>
          )}
          {busy && (
            <p
              role="status"
              className="flex items-center gap-2 text-[12px] text-muted"
            >
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t("discovery.installing")}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => (step === 1 && !instanceId ? setStep(0) : onClose())}
            className="app-button-secondary"
          >
            {t(
              step === 1 && !instanceId
                ? "common.back"
                : step === 2
                  ? "common.close"
                  : "common.cancel",
            )}
          </button>
          <div className="flex gap-2">
            {instanceId && error && (
              <button
                type="button"
                className="app-button-secondary"
                onClick={viewTask}
              >
                {t("discovery.viewTask")}
              </button>
            )}
            {step === 2 ? (
              <button
                type="button"
                className="app-button-primary"
                onClick={viewTask}
              >
                {t("discovery.viewTask")}
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy}
                className="app-button-primary"
              >
                {t(
                  step === 0
                    ? "discovery.configureNext"
                    : error && instanceId
                      ? "common.retry"
                      : "discovery.installPaused",
                )}
              </button>
            )}
          </div>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
