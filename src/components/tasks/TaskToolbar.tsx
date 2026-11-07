import {
  ExternalLink,
  Layers,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type {
  Project,
  RepositoryTask,
  TaskBinding,
  TaskFilters,
} from "../../lib/tauri";
import { TaskAttributeFilters } from "./TaskAttributeFilters";
import type { TaskViewPreferences } from "../../lib/taskViewPreferences";
import { ThemedSelect } from "../ThemedSelect";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { PlatformAccountButton } from "../accounts/PlatformAccountButton";
import { TaskFilterGroup } from "./TaskFilterGroup";
import { cn } from "../../utils";

import { taskPlatforms } from "@app/platforms";

interface Props {
  provider: TaskViewPreferences["provider"];
  projectIds: string[];
  projects: Project[];
  bindings: TaskBinding[];
  identities: string[];
  filters: TaskFilters;
  items: RepositoryTask[];
  search: string;
  loading: boolean;
  connections: boolean;
  accountRefresh: number;
  notice?: ReactNode;
  onProvider: (value: TaskViewPreferences["provider"]) => void;
  onProjects: (value: string[]) => void;
  onFilters: (patch: Partial<TaskFilters>) => void;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onConnections: () => void;
  onAccounts: () => void;
  onOpenRepository: (binding: TaskBinding) => void;
}

export function TaskToolbar({
  provider,
  projectIds,
  projects,
  bindings,
  identities,
  filters,
  items,
  search,
  loading,
  connections,
  accountRefresh,
  notice,
  onProvider,
  onProjects,
  onFilters,
  onSearch,
  onRefresh,
  onConnections,
  onAccounts,
  onOpenRepository,
}: Props) {
  const { t } = useTranslation();
  const scopedBindings = bindings.filter(
    (binding) => provider === "all" || binding.provider === provider,
  );
  const repository = scopedBindings.filter((binding) =>
    projectIds.includes(binding.project_id),
  );
  const context = identities.join(" · ");
  const selectedProjects = projects.filter((project) =>
    projectIds.includes(project.id),
  );
  const projectTaskCounts = new Map<string, number>();
  for (const item of items)
    projectTaskCounts.set(
      item.project_id,
      (projectTaskCounts.get(item.project_id) ?? 0) + 1,
    );
  const projectIcon = (projectId: string) => (
    <RepositoryPlatformIcon
      providers={bindings
        .filter((binding) => binding.project_id === projectId)
        .map((binding) => binding.provider)}
      fallbackLabel={t("tasks.project")}
    />
  );
  const providerIcon = (id: string) =>
    id === "all" ? (
      <Layers size={16} aria-hidden="true" />
    ) : (
      <RepositoryPlatformIcon
        providers={taskPlatforms
          .filter((platform) => platform.id === id)
          .map((platform) => platform.id)}
        fallbackLabel={t("tasks.provider")}
      />
    );
  return (
    <div className="shrink-0">
      <h1 className="sr-only">{t("tasks.title")}</h1>
      <div className="flex min-w-0 items-center gap-2 pb-2">
        <ThemedSelect
          aria-label={t("tasks.provider")}
          className="h-7 w-36 gap-2 py-0 text-xs"
          value={provider}
          leadingIcon={providerIcon(provider)}
          optionIcon={providerIcon}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "all") onProvider("all");
            else {
              const platform = taskPlatforms.find(
                (platform) => platform.id === value,
              );
              if (platform) onProvider(platform.id);
            }
          }}
        >
          <option value="all">{t("tasks.allProviders")}</option>
          {taskPlatforms.map((platform) => (
            <option value={platform.id} key={platform.id}>
              {platform.label}
            </option>
          ))}
        </ThemedSelect>
        <TaskFilterGroup
          label={t("tasks.kind")}
          value={filters.kind}
          onChange={(kind) => onFilters({ kind })}
          options={[
            {
              value: "issue",
              label: t("tasks.issues"),
            },
            {
              value: "review",
              label:
                provider === "gitlab"
                  ? "MR"
                  : provider === "github"
                    ? "PR"
                    : "PR / MR",
            },
          ]}
        />
        <div className="w-[180px] min-w-[100px] shrink">
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
              id === "all" ? (
                <Layers size={14} aria-hidden="true" />
              ) : (
                projectIcon(id)
              )
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
                disabled={
                  projectIds.length === 1 && projectIds[0] === project.id
                }
              >
                {project.name}
              </option>
            ))}
          </ThemedSelect>
        </div>
        {repository.length === 1 && (
          <button
            type="button"
            className="app-button-ghost h-7 w-7 p-0"
            title={t("tasks.openRemote")}
            aria-label={t("tasks.openRemote")}
            onClick={() => onOpenRepository(repository[0])}
          >
            <ExternalLink size={15} />
          </button>
        )}
        {context && (
          <span
            title={context}
            className="min-w-0 flex-1 truncate text-xs text-faint"
          >
            {context}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="app-button-ghost h-7 w-7 p-0"
            title={t("settings.refresh")}
            aria-label={t("settings.refresh")}
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw
              size={15}
              className={cn(
                loading && "animate-spin motion-reduce:animate-none",
              )}
            />
          </button>
          <PlatformAccountButton
            provider={provider}
            refreshKey={accountRefresh}
            onClick={onAccounts}
          />
          <button
            type="button"
            className={cn(
              "app-button-ghost h-7 w-7 p-0",
              connections && "bg-surface-active text-primary",
            )}
            title={t("tasks.connections")}
            aria-label={t("tasks.connections")}
            aria-expanded={connections}
            onClick={onConnections}
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {selectedProjects.length > 1 && (
        <ul
          aria-label={t("tasks.selectedProjects", {
            count: selectedProjects.length,
          })}
          tabIndex={0}
          className="mb-2 flex min-w-0 items-center gap-2 overflow-x-auto pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {selectedProjects.map((project) => (
            <li
              key={project.id}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-secondary"
            >
              {projectIcon(project.id)}
              <span>{project.name}</span>
              {!!projectTaskCounts.get(project.id) && (
                <span
                  className="tabular-nums text-muted"
                  title={t("tasks.loadedProjectTasks", {
                    count: projectTaskCounts.get(project.id),
                  })}
                >
                  {projectTaskCounts.get(project.id)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {notice}
      <div className="flex min-w-0 items-center gap-2 pb-2">
        <TaskAttributeFilters
          filters={filters}
          items={items}
          onChange={onFilters}
        />
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            aria-label={t("tasks.search")}
            className="app-input h-7 w-full pl-8 pr-8 text-xs"
            value={search}
            placeholder={t("tasks.search")}
            maxLength={256}
            onChange={(event) => onSearch(event.target.value)}
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 app-button-ghost h-6 w-6 p-0"
            aria-label={t("tasks.clearFilters")}
            onClick={() =>
              onFilters({
                state: "open",
                author: "",
                assignee: "",
                labels: [],
                personal: "all",
                text: "",
              })
            }
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
