import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type {
  Project,
  RepositoryTask,
  TaskBinding,
  TaskFilters,
} from "../../lib/tauri";
import { TaskAttributeFilters } from "./TaskAttributeFilters";
import { TaskFilterGroup } from "./TaskFilterGroup";
import { TaskSelectedProjects } from "./TaskSelectedProjects";

import {
  TaskScopeToolbar,
  type TaskScopeToolbarProps,
} from "./TaskScopeToolbar";
import { TaskProjectIcon, TaskProjectSelect } from "./TaskProjectSelect";

interface Props extends TaskScopeToolbarProps {
  projectIds: string[];
  projects: Project[];
  bindings: TaskBinding[];
  filters: TaskFilters;
  items: RepositoryTask[];
  search: string;
  notice?: ReactNode;
  scopeInSidebar?: boolean;
  onProjects: (value: string[]) => void;
  onFilters: (patch: Partial<TaskFilters>) => void;
  onSearch: (value: string) => void;
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
  leading,
  notice,
  scopeInSidebar = false,
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
  const selectedProjects = projects.filter((project) =>
    projectIds.includes(project.id),
  );
  const projectIcon = (id: string) => (
    <TaskProjectIcon bindings={bindings} id={id} />
  );
  return (
    <div className="shrink-0">
      {!leading && <h1 className="sr-only">{t("tasks.title")}</h1>}
      <TaskScopeToolbar
        provider={provider}
        identities={identities}
        loading={loading}
        connections={connections}
        accountRefresh={accountRefresh}
        leading={leading}
        repository={repository.length === 1 ? repository[0] : undefined}
        onProvider={onProvider}
        onRefresh={onRefresh}
        onConnections={onConnections}
        onAccounts={onAccounts}
        onOpenRepository={onOpenRepository}
      >
        {!scopeInSidebar && (
          <>
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
              <TaskProjectSelect
                projectIds={projectIds}
                projects={projects}
                bindings={bindings}
                onProjects={onProjects}
              />
            </div>
          </>
        )}
      </TaskScopeToolbar>
      {!scopeInSidebar && selectedProjects.length > 1 && (
        <TaskSelectedProjects
          projects={selectedProjects}
          projectIcon={projectIcon}
          tasks={items}
        />
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
