import type { TFunction } from "i18next";
import { automationLastResult, automationSchedule } from "./automation";
import { automationPrompts } from "./automationPrompts";
import type { AutomationTask } from "./tauri";

export function automationContext(
  task: AutomationTask,
  projectName: string | null,
  t: TFunction,
): string {
  const { definition } = task;
  const project = task.project || projectName;
  const scriptDir = definition?.script_dir;
  const location = scriptDir || task.location;
  const workdir = definition?.workdir;
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
    [t("automation.columns.project"), project],
    [
      t("automation.workdir"),
      workdir !== project && workdir !== location ? workdir : null,
    ],
    [
      t(scriptDir ? "automation.scriptDir" : "automation.columns.location"),
      location !== project ? location : null,
    ],
    [t("automation.packageVersion"), definition?.package_options?.version],
    [
      t("automation.columns.status"),
      task.status !== "unknown" ? t(`automation.states.${task.status}`) : null,
    ],
    [
      t("automation.columns.schedule"),
      definition || task.schedule ? automationSchedule(task, t) : null,
    ],
    [t("automation.columns.lastRun"), task.last_run],
    [
      t("automation.columns.lastResult"),
      task.last_result && task.status !== "running"
        ? automationLastResult(task, t)
        : null,
    ],
    [t("automation.activePromptVariant"), variant],
  ];
  const lines = [
    `# ${task.name}`,
    "",
    ...fields.flatMap(([label, value]) =>
      value ? [`- ${label}: ${value}`] : [],
    ),
  ];
  // A task package provides the full configuration at the copied script directory.
  if (task.is_package && scriptDir) return lines.join("\n");

  const sections = [
    [t("automation.prompt"), task.prompt],
    [
      t("automation.command"),
      task.command !== task.prompt ? task.command : null,
    ],
  ];
  for (const [label, value] of sections) {
    if (value?.trim())
      lines.push(
        "",
        `## ${label}`,
        "",
        value.trimEnd().replace(/^(?=.)/gm, "    "),
      );
  }
  return lines.join("\n");
}
