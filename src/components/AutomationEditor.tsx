import { AutomationScheduleInput } from "./AutomationScheduleInput";
import { useEffect, useRef, useState } from "react";
import { AutomationTaskContent } from "./AutomationTaskContent";
import { AutomationAgentField } from "./AutomationAgentField";
import { automationPromptFile, automationHerdrConfig } from "../lib/automation";
import { externalAutomationScriptDirectory } from "../lib/automationScriptDirectory";
import { AutomationWorkdirField } from "./AutomationWorkdirField";
import { AutomationProjectField } from "./AutomationProjectField";
import { AutomationTemplatePicker } from "./AutomationTemplatePicker";
import { X, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationDraft, AutomationTask } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { AutomationVersionField } from "./AutomationVersionField";
import { ToggleSwitch } from "./ToggleSwitch";
import { ConfirmDialog } from "./ConfirmDialog";
import { useNavigate } from "react-router-dom";

export function AutomationEditor({
  task,
  restoreBackup = false,
  hermesInstalled,
  onClose,
  onSave,
}: {
  task?: AutomationTask;
  restoreBackup?: boolean;
  hermesInstalled: boolean;
  onClose: () => void;
  onSave: (draft: AutomationDraft) => Promise<void>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AutomationDraft>(
    task?.definition ?? {
      package_options: { version: "1.0.0", dependencies: [], hermes: null },
      name: "",
      provider: "system",
      content: "",
      workdir: null,
      schedule: { kind: "daily", hour: 9, minute: 0, weekdays: true },
      enabled: !restoreBackup,
    },
  );
  const initialDraft = useRef(draft);
  const [leavingForDiscovery, setLeavingForDiscovery] = useState(false);
  const leaving = useRef(false);
  leaving.current = leavingForDiscovery;
  const [busy, setBusy] = useState(false);
  const [selectingAgent, setSelectingAgent] = useState(false);
  const [inactivePrompt, setInactivePrompt] = useState("");
  const [picker, setPicker] = useState<"backup" | null>(
    restoreBackup ? "backup" : null,
  );
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const panel = useRef<HTMLFormElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    name.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (leaving.current) return;
      // A native child modal owns keyboard navigation and Escape until closed.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("dialog[open]")
      )
        return;
      if (
        event.key === "Escape" &&
        event.target instanceof HTMLElement &&
        event.target.closest('[role="combobox"][aria-expanded="true"]')
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!pending.current) close.current();
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ].filter((node) => !node.hidden);
      const first = nodes[0];
      const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    if (picker)
      panel.current
        ?.querySelector<HTMLButtonElement>("section button")
        ?.focus();
    else name.current?.focus();
  }, [picker]);
  const openDiscovery = () => {
    onClose();
    navigate("/discover?type=automations&automationSource=recommended");
  };
  const discover = () => {
    if (
      JSON.stringify(draft) !== JSON.stringify(initialDraft.current) ||
      inactivePrompt
    )
      setLeavingForDiscovery(true);
    else openDiscovery();
  };
  const update = (value: Partial<AutomationDraft>) =>
    setDraft((previous) => ({ ...previous, ...value }));
  const externalNative =
    !!task && task.origin !== "agent_hub" && task.source !== "hermes";
  const schedule = draft.schedule;
  const scriptDir = externalNative
    ? externalAutomationScriptDirectory(draft.content, draft.workdir)
    : (draft.script_dir ?? task?.definition?.workdir ?? null);
  const herdrConfig = automationHerdrConfig(draft);
  const promptFile = automationPromptFile(draft);
  const submit = async () => {
    if (pending.current || picker !== null) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        workdir: draft.workdir?.trim() || null,
        script_dir: draft.script_dir?.trim() || null,
      });
    } catch (cause) {
      setError(
        getErrorMessage(cause, "").includes(
          "Wait for the current run to finish",
        )
          ? t("automation.waitToSave")
          : getErrorMessage(cause, t("automation.saveFailed")),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex max-h-[calc(100vh/var(--app-scale)_-_2rem)] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
          <h2
            id="automation-editor-title"
            className="text-[15px] font-semibold text-primary"
          >
            {t(
              task
                ? "automation.edit"
                : restoreBackup
                  ? "automation.restoreBackup"
                  : "automation.create",
            )}
          </h2>
          <div className="flex items-center gap-3">
            {!task && !picker && (
              <button
                type="button"
                disabled={busy}
                onClick={discover}
                className="app-button-secondary focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Sparkles className="h-4 w-4" />
                {t("automation.fromDiscovery")}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent p-1.5"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        {picker ? (
          <AutomationTemplatePicker
            source={picker}
            hermesInstalled={hermesInstalled}
            onBack={onClose}
            onChoose={(value) => {
              setDraft(value);
              setError(null);
              setPicker(null);
            }}
          />
        ) : (
          <div className="grid min-h-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-5 p-6 md:p-8">
              <label className="space-y-2">
                <span className="sr-only">{t("automation.columns.name")}</span>
                <input
                  ref={name}
                  required
                  maxLength={200}
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={t("automation.namePlaceholder")}
                  aria-label={t("automation.columns.name")}
                  disabled={busy}
                  className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight text-primary outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <AutomationTaskContent
                draft={draft}
                scriptDirectory={
                  task?.definition?.script_dir ?? task?.definition?.workdir
                }
                busy={busy || selectingAgent}
                inactivePrompt={inactivePrompt}
                onChange={update}
              />
            </div>
            <fieldset
              disabled={busy}
              className="min-w-0 space-y-6 border-t border-border-subtle bg-bg-secondary p-6 md:border-l md:border-t-0"
            >
              <AutomationAgentField
                draft={draft}
                disabled={busy || externalNative}
                providerLocked={!!task}
                onPendingChange={setSelectingAgent}
                onInactivePromptChange={setInactivePrompt}
                onChange={update}
              />
              {draft.files?.some(
                (file) =>
                  file.path === "network-reset/setup.sh" ||
                  file.path === "scripts/setup.sh",
              ) && (
                <p className="rounded-lg border border-border-subtle bg-surface p-3 text-[12px] leading-6 text-secondary">
                  {t("automation.networkSetupHelp")}
                </p>
              )}
              {!externalNative && (
                <AutomationVersionField draft={draft} onChange={update} />
              )}
              <AutomationProjectField
                value={draft.workdir}
                disabled={busy}
                onChange={(workdir) => update({ workdir })}
              />
              {draft.provider === "system" &&
                (!externalNative || scriptDir) && (
                  <AutomationWorkdirField
                    kind="scriptDir"
                    value={scriptDir}
                    readOnly={externalNative || !task || !!task.installation}
                    helpText={
                      externalNative
                        ? t("automation.externalScriptDirHelp")
                        : undefined
                    }
                    disabled={busy}
                    onChange={(script_dir) => update({ script_dir })}
                  />
                )}
              <AutomationScheduleInput
                schedule={schedule}
                provider={draft.provider}
                allowManual={!externalNative}
                onChange={(schedule) => update({ schedule })}
              />
              <div className="flex items-center justify-between gap-3 text-[12px] text-secondary">
                <span>{t("automation.enableSchedule")}</span>
                <ToggleSwitch
                  checked={draft.enabled}
                  disabled={busy || schedule.kind === "manual"}
                  title={t("automation.enableSchedule")}
                  onChange={() => update({ enabled: !draft.enabled })}
                />
              </div>
              {task?.status === "running" && (
                <p role="status" className="text-[12px] leading-6 text-muted">
                  {t("automation.editRunning")}
                </p>
              )}
              <p className="text-[12px] leading-6 text-muted">
                {t(
                  herdrConfig
                    ? "automation.herdrScheduleHelp"
                    : "automation.nativeHelp",
                )}
              </p>
            </fieldset>
          </div>
        )}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
          <div className="min-w-0 flex-1 text-[12px] leading-6 text-muted">
            {error ? (
              <p role="alert" className="break-words text-danger">
                {error}
              </p>
            ) : (
              t(
                restoreBackup
                  ? "automation.uninstalledSaveHint"
                  : schedule.kind === "manual"
                    ? "automation.manualSaveHint"
                    : !draft.enabled
                      ? "automation.pausedSaveHint"
                      : "automation.saveHint",
              )
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="app-button-secondary focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={
                busy ||
                selectingAgent ||
                picker !== null ||
                !draft.name.trim() ||
                !draft.content.trim() ||
                (!!promptFile && !promptFile.content.trim())
              }
              className="app-button-primary focus-visible:ring-2 focus-visible:ring-accent"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t(task ? "common.save" : "automation.createAction")}
            </button>
          </div>
        </footer>
      </form>
      <ConfirmDialog
        open={leavingForDiscovery}
        title={t("automation.leaveForDiscoveryTitle")}
        message={t("automation.leaveForDiscoveryMessage")}
        confirmLabel={t("automation.fromDiscovery")}
        tone="warning"
        onClose={() => setLeavingForDiscovery(false)}
        onConfirm={async () => openDiscovery()}
      />
    </div>
  );
}
