import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { automationAgentConfig } from "../lib/automation";
import type { automationTaskAgent } from "../lib/automationAgents";
import { formatPosixArgv } from "../lib/previewAgentCommand";
import { getAgentLaunchPlan, type AutomationTask } from "../lib/tauri";
import { AgentIcon } from "./AgentIcon";
import { HelpTooltip } from "./HelpTooltip";

export function AutomationAgentCell({
  agent,
  task,
}: {
  agent: ReturnType<typeof automationTaskAgent>;
  task: AutomationTask;
}) {
  const { t } = useTranslation();
  if (!agent) return "—";
  return (
    <HelpTooltip
      label={agent.label}
      triggerContent={
        <>
          {agent.iconKey && (
            <AgentIcon agentKey={agent.iconKey} className="h-5 w-5" />
          )}
          <span className="min-w-0 truncate">{agent.label}</span>
        </>
      }
    >
      <p className="font-medium">
        {t("agentLaunch.schemes.currentInstruction")}
      </p>
      <AutomationLaunchInstruction task={task} kind={agent.kind} />
    </HelpTooltip>
  );
}

/** Mounted only while the tooltip is visible, so list loading never resolves task argv. */
function AutomationLaunchInstruction({
  task,
  kind,
}: {
  task: AutomationTask;
  kind?: string;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ command?: string; key: string }>();
  const native =
    task.source === "hermes" || task.definition?.provider === "hermes";
  const draft = task.definition;
  const key = JSON.stringify([task.id, task.revision, kind]);
  useEffect(() => {
    const launch =
      !native && draft && automationAgentConfig(draft)?.value.launch;
    if (!kind || !launch) return;
    let active = true;
    void getAgentLaunchPlan(kind, launch.scheme_id).then(
      (plan) => {
        const args = [...plan.arguments, ...launch.arguments];
        // Match the unattended Codex guard added by the execution runtime.
        if (
          plan.kind === "codex" &&
          !args.includes("check_for_update_on_startup=false")
        )
          args.unshift("-c", "check_for_update_on_startup=false");
        if (active)
          setResult({ command: formatPosixArgv([plan.program, ...args]), key });
      },
      () => {
        if (active) setResult({ key });
      },
    );
    return () => {
      active = false;
    };
  }, [draft, key, kind, native]);
  if (native) return <p>{t("automation.agentLaunchManagedByHermes")}</p>;
  if (!kind || !draft || !automationAgentConfig(draft))
    return <p>{t("automation.agentLaunchUnavailable")}</p>;
  if (result?.key !== key) return <p>{t("common.loading")}</p>;
  return result.command ? (
    <code className="block break-all whitespace-pre-wrap">
      {result.command}
    </code>
  ) : (
    <p>{t("automation.agentLaunchUnavailable")}</p>
  );
}
