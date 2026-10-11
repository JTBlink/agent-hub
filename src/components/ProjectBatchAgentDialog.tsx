import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { ProjectAgentTarget } from "../lib/tauri";
import {
  applyProjectBatchAgents,
  type BatchProjectSkill,
} from "../lib/projectBatchAgents";
import { getErrorMessage } from "../lib/error";
import { AgentIcon } from "./AgentIcon";

export function ProjectBatchAgentDialog({
  projectId,
  skills,
  targets,
  enabled,
  onClose,
  onComplete,
}: {
  projectId: string;
  skills: BatchProjectSkill[];
  targets: ProjectAgentTarget[];
  enabled: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const available = targets.filter(
    (target) => target.installed && target.enabled,
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const apply = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      const result = await applyProjectBatchAgents(
        projectId,
        skills,
        selected,
        enabled,
        (agent) =>
          t("project.agentAddRequiresCenter", {
            agent:
              targets.find((item) => item.key === agent)?.display_name ?? agent,
          }),
      );
      setErrors(
        result.errors.map(
          (item) =>
            `${item.skillName} · ${targets.find((target) => target.key === item.agentKey)?.display_name ?? item.agentKey}: ${getErrorMessage(item.error, t("common.error"))}`,
        ),
      );
      if (result.changed > 0)
        toast.success(
          t("project.batchAgents.completed", { count: result.changed }),
        );
      await onComplete();
      if (result.errors.length === 0) onClose();
    } catch (error) {
      setErrors([getErrorMessage(error, t("common.error"))]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-agent-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative flex max-h-[calc(85vh/var(--app-scale))] w-full max-w-lg flex-col rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="batch-agent-title"
            className="text-[14px] font-semibold text-primary"
          >
            {t(
              enabled
                ? "project.batchAgents.enable"
                : "project.batchAgents.disable",
            )}
          </h2>
          <button
            disabled={busy}
            onClick={onClose}
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-[12px] text-muted">
          {t(
            enabled
              ? "project.batchAgents.enableHint"
              : "project.batchAgents.disableHint",
            { count: skills.length },
          )}
        </p>
        <div className="min-h-0 overflow-y-auto space-y-2">
          {available.length === 0 && (
            <p className="text-muted">{t("project.batchAgents.noAgents")}</p>
          )}
          {available.map((target) => {
            const active = skills.filter((skill) =>
              skill.variants.some((v) => v.agent === target.key && v.enabled),
            ).length;
            return (
              <label
                key={target.key}
                className="flex items-center gap-2 rounded-lg border border-border-subtle p-2 text-[13px]"
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(target.key)}
                  onChange={(event) =>
                    setSelected((prev) =>
                      event.target.checked
                        ? [...prev, target.key]
                        : prev.filter((key) => key !== target.key),
                    )
                  }
                />
                <AgentIcon
                  agentKey={target.key}
                  displayName={target.display_name}
                  className="h-5 w-5"
                />
                <span className="flex-1 text-secondary">
                  {target.display_name}
                </span>
                <span className="text-muted">
                  {t("project.batchAgents.agentStatus", {
                    active,
                    total: skills.length,
                  })}
                </span>
              </label>
            );
          })}
          {errors.length > 0 && (
            <div role="alert" className="space-y-1 text-[12px] text-danger">
              {errors.map((error, index) => (
                <p key={index} className="whitespace-pre-wrap break-words">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            disabled={busy || selected.length === 0}
            onClick={() => void apply()}
            className="rounded-lg bg-accent-dark px-3 py-1.5 text-[13px] text-white disabled:opacity-50"
          >
            {busy
              ? t("common.loading")
              : t(
                  enabled
                    ? "project.batchAgents.enable"
                    : "project.batchAgents.disable",
                )}
          </button>
        </div>
      </div>
    </div>
  );
}
