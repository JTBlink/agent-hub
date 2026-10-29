import { ThemedSelect } from "./ThemedSelect";
import { useEffect, useRef, useState } from "react";
import { AutomationTaskContent } from "./AutomationTaskContent";
import { AutomationAgentField } from "./AutomationAgentField";
import { automationPromptFile, automationHerdrConfig } from "../lib/automation";
import { AutomationWorkdirField } from "./AutomationWorkdirField";
import { AutomationProjectField } from "./AutomationProjectField";
import { AutomationTemplatePicker } from "./AutomationTemplatePicker";
import { X, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AutomationDraft,
  AutomationTask,
  AutomationSchedule,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { ToggleSwitch } from "./ToggleSwitch";

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
  const [draft, setDraft] = useState<AutomationDraft>(
    task?.definition ?? {
      name: "",
      provider: "system",
      content: "",
      workdir: null,
      schedule: { kind: "daily", hour: 9, minute: 0, weekdays: true },
      enabled: !restoreBackup,
    },
  );
  const [busy, setBusy] = useState(false);
  const [selectingAgent, setSelectingAgent] = useState(false);
  const [inactivePrompt, setInactivePrompt] = useState("");
  const [picker, setPicker] = useState<"builtin" | "backup" | null>(
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
  const update = (value: Partial<AutomationDraft>) =>
    setDraft((previous) => ({ ...previous, ...value }));
  const externalNative =
    !!task && task.origin !== "agent_hub" && task.source !== "hermes";
  const schedule = draft.schedule;
  const herdrConfig = automationHerdrConfig(draft);
  const promptFile = automationPromptFile(draft);
  const mode =
    schedule.kind === "daily" && schedule.weekdays ? "weekdays" : schedule.kind;
  const changeMode = (mode: string) => {
    const schedule: AutomationSchedule =
      mode === "hourly"
        ? { kind: "hourly", minute: 15 }
        : mode === "interval"
          ? { kind: "interval", minutes: 60 }
          : mode === "manual"
            ? { kind: "manual" }
            : mode === "custom"
              ? { kind: "custom", expression: "0 9 * * 1-5" }
              : {
                  kind: "daily",
                  hour: 9,
                  minute: 0,
                  weekdays: mode === "weekdays",
                };
    update({ schedule });
  };
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
                onClick={() => setPicker("builtin")}
                className="app-button-secondary focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Sparkles className="h-4 w-4" />
                {t("automation.useTemplate")}
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
            onBack={() => (picker === "backup" ? onClose() : setPicker(null))}
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
                (file) => file.path === "network-reset/setup.sh",
              ) && (
                <p className="rounded-lg border border-border-subtle bg-surface p-3 text-[12px] leading-6 text-secondary">
                  {t("automation.networkSetupHelp")}
                </p>
              )}
              <AutomationProjectField
                value={draft.workdir}
                disabled={busy}
                onChange={(workdir) => update({ workdir })}
              />
              {draft.provider === "system" && !externalNative && (
                <details className="border-t border-border-subtle pt-4">
                  <summary className="cursor-pointer text-[12px] font-medium text-muted focus-visible:ring-2 focus-visible:ring-accent">
                    {t("automation.advanced")}
                  </summary>
                  <div className="mt-4 space-y-4">
                    {herdrConfig && (
                      <label className="block space-y-2">
                        <span className="text-[12px] font-medium text-muted">
                          {t("automation.herdrSession")}
                        </span>
                        <input
                          className="app-input w-full"
                          aria-label={t("automation.herdrSession")}
                          disabled={busy}
                          value={
                            "session" in herdrConfig.value &&
                            typeof herdrConfig.value.session === "string"
                              ? herdrConfig.value.session
                              : "default"
                          }
                          onChange={(event) =>
                            update({
                              files: draft.files?.map((file) =>
                                file.path === herdrConfig.file.path
                                  ? {
                                      ...file,
                                      content:
                                        JSON.stringify(
                                          {
                                            ...herdrConfig.value,
                                            session: event.target.value,
                                          },
                                          null,
                                          2,
                                        ) + "\n",
                                    }
                                  : file,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    <AutomationWorkdirField
                      kind="scriptDir"
                      value={draft.script_dir ?? null}
                      disabled={busy}
                      onChange={(script_dir) => update({ script_dir })}
                    />
                  </div>
                </details>
              )}
              <div className="space-y-3">
                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-muted">
                    {t("automation.columns.schedule")}
                  </span>
                  <ThemedSelect
                    aria-label={t("automation.columns.schedule")}
                    value={mode}
                    onChange={(e) => changeMode(e.target.value)}
                    className="app-input w-full"
                  >
                    {[
                      "weekdays",
                      "daily",
                      "hourly",
                      "interval",
                      ...(draft.provider === "system"
                        ? externalNative
                          ? []
                          : ["manual"]
                        : ["custom"]),
                    ].map((value) => (
                      <option key={value} value={value}>
                        {t(`automation.schedules.${value}`)}
                      </option>
                    ))}
                  </ThemedSelect>
                </label>
                {schedule.kind === "daily" && (
                  <label className="block space-y-2">
                    <span className="text-[12px] font-medium text-muted">
                      {t("automation.localTime")}
                    </span>
                    <input
                      type="time"
                      required
                      aria-label={t("automation.localTime")}
                      value={`${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`}
                      onChange={(e) => {
                        const [hour, minute] = e.target.value
                          .split(":")
                          .map(Number);
                        update({ schedule: { ...schedule, hour, minute } });
                      }}
                      className="app-input w-full"
                    />
                  </label>
                )}
                {schedule.kind === "interval" && (
                  <label className="block space-y-2">
                    <span className="text-[12px] font-medium text-muted">
                      {t("automation.intervalMinutes")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={525600}
                      required
                      aria-label={t("automation.intervalMinutes")}
                      value={schedule.minutes}
                      onChange={(e) =>
                        update({
                          schedule: {
                            kind: "interval",
                            minutes: Number(e.target.value),
                          },
                        })
                      }
                      className="app-input w-full"
                    />
                  </label>
                )}
                {schedule.kind === "hourly" && (
                  <label className="block space-y-2">
                    <span className="text-[12px] font-medium text-muted">
                      {t("automation.hourlyMinute")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      required
                      value={schedule.minute}
                      aria-label={t("automation.hourlyMinute")}
                      onChange={(event) =>
                        update({
                          schedule: {
                            kind: "hourly",
                            minute: Number(event.target.value),
                          },
                        })
                      }
                      className="app-input w-full"
                    />
                  </label>
                )}
                {schedule.kind === "custom" && (
                  <label className="block space-y-2">
                    <span className="text-[12px] font-medium text-muted">
                      {t("automation.expression")}
                    </span>
                    <input
                      required
                      aria-label={t("automation.expression")}
                      value={schedule.expression}
                      onChange={(e) =>
                        update({
                          schedule: {
                            kind: "custom",
                            expression: e.target.value,
                          },
                        })
                      }
                      className="app-input w-full font-mono"
                    />
                  </label>
                )}
                <p className="text-[11px] leading-5 text-muted">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
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
                schedule.kind === "manual"
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
    </div>
  );
}
