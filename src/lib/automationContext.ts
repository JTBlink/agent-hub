import type { TFunction } from "i18next";
import {
  automationLastResult,
  automationNextRun,
  automationSchedule,
} from "./automation";
import { automationPrompts } from "./automationPrompts";
import type { AutomationTask } from "./tauri";

export function automationContext(
  task: AutomationTask,
  projectName: string | null,
  locale: string,
  t: TFunction,
): string {
  const { definition } = task;
  const project = [projectName, task.project]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
  const prompts =
    task.prompt && definition
      ? automationPrompts(definition, t("automation.defaultPromptVariant"))
      : null;
  const variant =
    prompts && !prompts.invalid && prompts.variants.length > 1
      ? prompts.variants.find(({ id }) => id === prompts.activeId)?.name
      : null;
  const fields = [
    [t("automation.taskId"), task.id],
    [t("automation.columns.identifier"), task.identifier],
    [t("automation.columns.bundleId"), task.bundle_id],
    [t("automation.originFilter"), t(`automation.origins.${task.origin}`)],
    [t("automation.scheduler"), t(`automation.sources.${task.source}`)],
    [t("automation.columns.status"), t(`automation.states.${task.status}`)],
    [t("automation.columns.project"), project],
    [t("automation.workdir"), definition?.workdir],
    [t("automation.scriptDir"), definition?.script_dir],
    [t("automation.columns.location"), task.location],
    [t("automation.packageVersion"), definition?.package_options?.version],
    [t("automation.columns.agent"), task.agent_kind],
    [t("automation.columns.schedule"), automationSchedule(task, t)],
    [t("automation.columns.nextRun"), automationNextRun(task, locale, t)],
    [t("automation.columns.lastRun"), task.last_run],
    [t("automation.columns.lastResult"), automationLastResult(task, t)],
    [t("automation.activePromptVariant"), variant],
  ];
  const sections = [
    [t("automation.descriptionLabel"), definition?.description],
    [t("automation.prompt"), task.prompt],
    [t("automation.command"), task.command],
  ];
  return [
    `# ${task.name}`,
    "",
    ...fields.flatMap(([label, value]) =>
      value ? [`- ${label}: ${value}`] : [],
    ),
    ...sections.flatMap(([label, value]) =>
      value ? ["", `## ${label}`, "", value.replace(/^/gm, "    ")] : [],
    ),
  ].join("\n");
}
