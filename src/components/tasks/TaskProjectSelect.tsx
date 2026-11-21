import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Project, TaskBinding } from "../../lib/tauri";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { ThemedSelect } from "../ThemedSelect";

export function TaskProjectIcon({
  bindings,
  id,
}: {
  bindings: TaskBinding[];
  id: string;
}) {
  const { t } = useTranslation();
  return (
    <RepositoryPlatformIcon
      providers={bindings
        .filter((binding) => binding.project_id === id)
        .map((binding) => binding.provider)}
      fallbackLabel={t("tasks.project")}
    />
  );
}

export function TaskProjectSelect({
  projectIds,
  projects,
  bindings,
  onProjects,
}: {
  projectIds: string[];
  projects: Project[];
  bindings: TaskBinding[];
  onProjects: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const projectIcon = (id: string) => (
    <TaskProjectIcon bindings={bindings} id={id} />
  );
  return (
    <ThemedSelect
      aria-label={t("tasks.project")}
      className="h-7 w-full gap-2 py-0 text-xs"
      leadingIcon={
        projectIds.length === 1 ? (
          projectIcon(projectIds[0])
        ) : (
          <RepositoryPlatformIcon
            providers={[]}
            fallbackLabel={t("tasks.project")}
          />
        )
      }
      optionIcon={(id) =>
        id === "all" ? <Layers size={14} aria-hidden="true" /> : projectIcon(id)
      }
      multiple
      valueBadge={
        projectIds.length > 1 ? (
          <span
            role="img"
            aria-label={t("tasks.selectedProjects", {
              count: projectIds.length,
            })}
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-surface-active px-1 text-xs font-medium tabular-nums text-secondary"
          >
            {projectIds.length}
          </span>
        ) : undefined
      }
      value={projectIds.length ? projectIds : ["all"]}
      onChange={(values) =>
        onProjects(
          projectIds.length && values.includes("all")
            ? []
            : values.filter((value) => value !== "all"),
        )
      }
    >
      <option value="all">{t("tasks.allProjects")}</option>
      {projects.map((project) => (
        <option
          value={project.id}
          key={project.id}
          disabled={projectIds.length === 1 && projectIds[0] === project.id}
        >
          {project.name}
        </option>
      ))}
    </ThemedSelect>
  );
}
