import {
  ExternalLink,
  FolderGit2,
  Github,
  Gitlab,
  Layers,
  RefreshCw,
  Search,
  Settings2,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Project, TaskBinding, TaskFilters } from "../../lib/tauri";
import type { TaskViewPreferences } from "../../lib/taskViewPreferences";
import { ThemedSelect } from "../ThemedSelect";
import { TaskFilterGroup } from "./TaskFilterGroup";
import { cn } from "../../utils";

interface Props {
  provider: TaskViewPreferences["provider"];
  projectId: string;
  projects: Project[];
  bindings: TaskBinding[];
  identities: string[];
  filters: TaskFilters;
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
            {
              value: "github",
              label: "GitHub",
              icon: <Github size={17} aria-hidden="true" />,
            },
            {
              value: "gitlab",
              label: "GitLab",
              icon: <Gitlab size={17} aria-hidden="true" />,
            },
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
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 pb-2">
        <TaskFilterGroup
          label={t("tasks.state")}
          value={filters.state}
          onChange={(state) => onFilters({ state })}
          options={[
            { value: "open", label: t("tasks.open") },
            { value: "closed", label: t("tasks.closed") },
            { value: "all", label: t("tasks.allStates") },
          ]}
        />
        <ThemedSelect
          aria-label={t("tasks.personal")}
          className="h-7 w-[140px] border-transparent bg-transparent py-0 text-xs"
          leadingIcon={
            <UserRound
              size={13}
              className="shrink-0 text-muted"
              aria-hidden="true"
            />
          }
          value={filters.personal}
          onChange={(event) =>
            onFilters({
              personal:
                event.target.value === "assigned"
                  ? "assigned"
                  : event.target.value === "created"
                    ? "created"
                    : "all",
            })
          }
        >
          <option value="all">{t("tasks.everyone")}</option>
          <option value="assigned">{t("tasks.assigned")}</option>
          <option value="created">{t("tasks.created")}</option>
        </ThemedSelect>
        <div className="relative ml-auto min-w-[180px] flex-1 basis-[200px]">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            aria-label={t("tasks.search")}
            className="app-input h-7 w-full pl-8 text-xs"
            value={search}
            placeholder={t("tasks.search")}
            maxLength={256}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
