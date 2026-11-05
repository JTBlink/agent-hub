import {
  ExternalLink,
  FolderGit2,
  Layers,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  Project,
  RepositoryTask,
  TaskBinding,
  TaskFilters,
} from "../../lib/tauri";
import { TaskAttributeFilters } from "./TaskAttributeFilters";
import type { TaskViewPreferences } from "../../lib/taskViewPreferences";
import { ThemedSelect } from "../ThemedSelect";
import { TaskFilterGroup } from "./TaskFilterGroup";
import { cn } from "../../utils";

import { taskPlatforms } from "@app/platforms";

interface Props {
  provider: TaskViewPreferences["provider"];
  projectId: string;
  projects: Project[];
  bindings: TaskBinding[];
  identities: string[];
  filters: TaskFilters;
  items: RepositoryTask[];
  search: string;
  loading: boolean;
  connections: boolean;
  onProvider: (value: TaskViewPreferences["provider"]) => void;
  onProject: (value: string) => void;
  onFilters: (patch: Partial<TaskFilters>) => void;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onConnections: () => void;
  onOpenRepository: (binding: TaskBinding) => void;
}

export function TaskToolbar({
  provider,
  projectId,
  projects,
  bindings,
  identities,
  filters,
  items,
  search,
  loading,
  connections,
  onProvider,
  onProject,
  onFilters,
  onSearch,
  onRefresh,
  onConnections,
  onOpenRepository,
}: Props) {
  const { t } = useTranslation();
  const scopedBindings = bindings.filter(
    (binding) => provider === "all" || binding.provider === provider,
  );
  const repository = scopedBindings.filter(
    (binding) => binding.project_id === projectId,
  );
  const context = identities.join(" · ");
  return (
    <div className="shrink-0">
      <h1 className="sr-only">{t("tasks.title")}</h1>
      <div className="flex min-w-0 items-center gap-2 pb-2">
        <TaskFilterGroup
          label={t("tasks.provider")}
          value={provider}
          compact
          onChange={onProvider}
          options={[
            {
              value: "all",
              label: t("tasks.allProviders"),
              icon: <Layers size={16} aria-hidden="true" />,
            },
            ...taskPlatforms.map((platform) => ({
              value: platform.id,
              label: platform.label,
              icon: <platform.icon className="h-4 w-4" />,
            })),
          ]}
        />
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
            className="h-7 w-full py-0 text-xs"
            leadingIcon={
              <FolderGit2
                size={14}
                className="shrink-0 text-muted"
                aria-hidden="true"
              />
            }
            value={projectId}
            onChange={(event) => onProject(event.target.value)}
          >
            <option value="all">{t("tasks.allProjects")}</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
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
          <button
            type="button"
            className={cn(
              "app-button-ghost h-7 w-7 p-0",
              connections && "bg-surface-active text-primary",
            )}
            title={
              context
                ? `${t("tasks.connections")} · ${context}`
                : t("tasks.connections")
            }
            aria-label={t("tasks.connections")}
            aria-expanded={connections}
            onClick={onConnections}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>
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
