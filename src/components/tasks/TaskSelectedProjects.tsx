import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils";
import type { Project, RepositoryTask } from "../../lib/tauri";

export function TaskSelectedProjects({
  projects,
  projectIcon,
  tasks,
  compact = false,
}: {
  projects: readonly Pick<Project, "id" | "name">[];
  projectIcon: (projectId: string) => ReactNode;
  compact?: boolean;
  tasks?: readonly Pick<RepositoryTask, "project_id">[];
}) {
  const { t } = useTranslation();
  const taskCounts = new Map<string, number>();
  for (const task of tasks ?? [])
    taskCounts.set(task.project_id, (taskCounts.get(task.project_id) ?? 0) + 1);
  return (
    <ul
      aria-label={t("tasks.selectedProjects", { count: projects.length })}
      tabIndex={0}
      className={cn(
        "flex min-w-0 items-center gap-2 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        !compact && "mb-2 pb-1",
      )}
    >
      {projects.map((project) => {
        const count = taskCounts.get(project.id);
        return (
          <li
            key={project.id}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-secondary"
          >
            {projectIcon(project.id)}
            <span>{project.name}</span>
            {!!count && (
              <span
                className="tabular-nums text-muted"
                title={t("tasks.loadedProjectTasks", { count })}
              >
                {count}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
