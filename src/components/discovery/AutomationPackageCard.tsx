import { Bot, Plus, SquareTerminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationInstallSource } from "../../lib/automationDiscovery";
import { automationRequirements } from "../../lib/automationDiscovery";
import {
  automationPromptFile,
  formatAutomationSchedule,
} from "../../lib/automation";

/** Match RecommendedSkillCard's padding, type scale and content-driven height. */
export function AutomationPackageCard({
  task,
  onInstall,
}: {
  task: AutomationInstallSource;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const agent =
    task.draft.provider === "hermes" || !!automationPromptFile(task.draft);
  const Icon = agent ? Bot : SquareTerminal;
  const tags = [
    t(agent ? "discovery.agentTask" : "discovery.commandTask"),
    formatAutomationSchedule(task.draft.schedule, t),
    ...automationRequirements(task),
  ];
  return (
    <article className="app-panel flex min-w-0 flex-col gap-2 p-3 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-accent-border bg-accent-bg text-accent-light">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <h3
            className="truncate text-[13px] font-semibold text-secondary"
            title={task.title}
          >
            {task.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onInstall}
          aria-label={t("discovery.installNamed", { name: task.title })}
          title={t("automation.installPackage")}
          className="shrink-0 rounded-[5px] border border-accent-border bg-accent-dark p-1 text-white hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        {task.description}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span
          title={task.source}
          className="max-w-full truncate rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-[13px] font-medium leading-4 text-accent-light"
        >
          {task.source}
        </span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-[5px] border border-border-subtle bg-background px-1.5 py-0.5 text-[13px] leading-4 text-muted"
          >
            {tag}
          </span>
        ))}
        {task.requiresAdmin && (
          <span className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[12px] text-amber-700 dark:text-amber-400">
            {t("discovery.requiresAdmin")}
          </span>
        )}
      </div>
    </article>
  );
}
