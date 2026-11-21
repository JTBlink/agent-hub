import { CircleDot, GitPullRequest, Server, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ResizableSidebar } from "../ResizableSidebar";
import type { Project, TaskBinding } from "../../lib/tauri";
import { TaskProjectSelect } from "./TaskProjectSelect";
import { SingleChoiceGroup } from "../SingleChoiceGroup";

export type TaskWorkspaceView = "issue" | "review" | "runner";

export function TaskWorkspaceSidebar({
  view,
  reviewLabel,
  projects,
  bindings,
  projectIds,
  onProjects,
  onView,
  onConnections,
}: {
  view: TaskWorkspaceView;
  reviewLabel: string;
  projects: Project[];
  bindings: TaskBinding[];
  projectIds: string[];
  onProjects: (ids: string[]) => void;
  onView: (view: TaskWorkspaceView) => void;
  onConnections: () => void;
}) {
  const { t } = useTranslation();
  const entries = [
    { key: "issue", label: t("tasks.issues"), icon: CircleDot },
    { key: "review", label: reviewLabel, icon: GitPullRequest },
    { key: "runner", label: t("runners.title"), icon: Server },
  ] as const;
  return (
    <ResizableSidebar
      storageKey="agent-hub.tasks.sidebar-width"
      label={t("tasks.title")}
      defaultWidth={224}
      minWidth={146}
      maxWidth={360}
      constrainToParent
      className="flex min-h-0 flex-col border-r border-border-subtle pr-3"
    >
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <p className="text-sm font-medium">{t("tasks.title")}</p>
        <TaskProjectSelect
          {...{ projectIds, projects, bindings, onProjects }}
        />
        <SingleChoiceGroup
          label={t("tasks.kind")}
          value={view}
          onChange={onView}
          vertical
          options={entries.map(({ key, label, icon: Icon }) => ({
            value: key,
            label,
            icon: <Icon size={16} aria-hidden="true" />,
          }))}
        />
        <button
          type="button"
          className="app-button-ghost w-full justify-start gap-2 px-2 text-xs"
          onClick={onConnections}
        >
          <Settings2 size={16} aria-hidden="true" />
          {t("tasks.platformConnections")}
        </button>
      </div>
    </ResizableSidebar>
  );
}
