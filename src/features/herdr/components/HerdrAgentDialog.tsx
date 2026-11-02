import { useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { useApp } from "../../../context/AppContext";
import { automationAgentOptions } from "../../../lib/automationAgents";
import * as api from "../api";
import { getErrorMessage } from "../../../lib/error";

export interface HerdrDialogRequest {
  mode: "new" | "prompt" | "output" | "interrupt";
  target: api.HerdrTarget;
  label: string;
  output?: string;
}
export function HerdrAgentDialog({
  request,
  onClose,
  onComplete,
  onFocus,
}: {
  request: HerdrDialogRequest;
  onClose: () => void;
  onComplete: () => void;
  onFocus: (target: api.HerdrTarget) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { tools } = useApp();
  const options = automationAgentOptions(tools);
  const [kind, setKind] = useState(options[0]?.kind ?? "");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [direction, setDirection] = useState<"right" | "down">("right");
  const [focus, setFocus] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<api.HerdrTarget | null>(null);
  const create = request.mode === "new",
    task = request.mode === "prompt";
  const confirm = async () => {
    setError("");
    try {
      if (created) {
        await onFocus(created);
      } else if (create) {
        const result = await api.startHerdrAgent(request.target, {
          kind,
          name,
          direction,
          prompt,
        });
        setCreated(result.target);
        onComplete();
        if (result.warning) {
          setError(result.warning);
          return false;
        }
        if (focus) await onFocus(result.target);
      } else if (task)
        await api.runHerdrAction(request.target, "prompt", prompt);
      else if (request.mode === "interrupt")
        await api.runHerdrAction(request.target, "interrupt");
      else await onFocus(request.target);
      onComplete();
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
      return false;
    }
  };
  return (
    <ConfirmDialog
      open
      title={t(`herdr.dialog.${request.mode}`)}
      message={request.label}
      tone={request.mode === "interrupt" ? "danger" : "warning"}
      onClose={onClose}
      onConfirm={confirm}
      confirmLabel={t(
        request.mode === "output" || created
          ? "herdr.focus"
          : create
            ? "herdr.createAgent"
            : task
              ? "herdr.sendTask"
              : "herdr.interrupt",
      )}
      confirmDisabled={
        created
          ? false
          : create
            ? !kind || !/^[a-z][a-z0-9_-]{0,31}$/.test(name)
            : task && !prompt.trim()
      }
      secondaryAction={
        request.mode === "output" ? (
          <button
            type="button"
            className="app-button-secondary"
            onClick={() =>
              void writeText(request.output ?? "").catch((error) =>
                setError(getErrorMessage(error, t("common.error"))),
              )
            }
          >
            {t("herdr.copyOutput")}
          </button>
        ) : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-3 text-xs">
        {create && !created && (
          <>
            <label className="flex flex-col gap-1">
              {t("herdr.agentType")}
              <ThemedSelect
                aria-label={t("herdr.agentType")}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.kind}>
                    {o.display_name}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            {!options.length && (
              <p className="text-warning">{t("herdr.noInstalledAgents")}</p>
            )}
            <label className="flex flex-col gap-1">
              {t("herdr.agentName")}
              <input
                className="app-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                autoComplete="off"
              />
            </label>
            <p className="text-muted">{t("herdr.nameHelp")}</p>
            <div className="flex gap-4">
              {(["right", "down"] as const).map((value) => (
                <label key={value} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="herdr-direction"
                    checked={direction === value}
                    onChange={() => setDirection(value)}
                  />
                  {t(
                    value === "right"
                      ? "terminal.splitHorizontal"
                      : "terminal.splitVertical",
                  )}
                </label>
              ))}
            </div>
          </>
        )}
        {!created && (create || task) && (
          <>
            <label className="flex flex-col gap-1">
              {t(create ? "herdr.initialTask" : "herdr.task")}
              <textarea
                className="app-input min-h-28 resize-y"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={32768}
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {["review", "test", "debug"].map((key) => (
                <button
                  type="button"
                  key={key}
                  className="app-button-secondary px-2 py-1"
                  onClick={() => setPrompt(t(`herdr.templates.${key}.prompt`))}
                >
                  {t(`herdr.templates.${key}.label`)}
                </button>
              ))}
            </div>
          </>
        )}
        {create && !created && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={focus}
              onChange={(e) => setFocus(e.target.checked)}
            />
            {t("herdr.focusAfterCreate")}
          </label>
        )}
        {request.mode === "output" && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-background p-3 font-mono">
            {request.output}
          </pre>
        )}
        {request.mode === "interrupt" && (
          <p className="text-muted">{t("herdr.interruptHelp")}</p>
        )}
        {error && (
          <p role="alert" className="text-danger whitespace-pre-wrap">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
