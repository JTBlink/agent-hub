import { WorkspaceSelectionValue } from "./WorkspaceSelectionValue";
import { GitBranch, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../ThemedSelect";
import { useApp } from "../../context/AppContext";
import type { Project } from "../../lib/tauri";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { compactHomePath } from "../../utils";
import { cn } from "../../utils";

export function ProjectSwitcher({
  onRemove,
}: {
  onRemove: (project: Project) => void;
}) {
  const { t } = useTranslation();
  const { projects } = useApp();
  const selection = useWorkspaceSelection(projects);
  const { project, loading, error, refresh } = selection;
  return (
    <div
      role="group"
      aria-label={t("worktree.title")}
      className="shrink-0 border-b border-border-subtle px-2 py-1"
    >
      <div className="flex h-7 min-w-0 items-center gap-0.5">
        {project && (
          <>
            <div className="min-w-0 flex-1">
              <ThemedSelect
                aria-label={t("worktree.title")}
                title={
                  selection.path
                    ? `${selection.selectedLabel}\n${compactHomePath(selection.path)}`
                    : t("worktree.title")
                }
                renderValue={() => (
                  <WorkspaceSelectionValue
                    project={project.name}
                    branch={selection.branchLabel}
                  />
                )}
                value={selection.value}
                disabled={loading || selection.options.length === 0}
                onChange={(event) => selection.select(event.target.value)}
                leadingIcon={<GitBranch size={13} className="shrink-0" />}
                className="h-7 w-full gap-1 rounded border-transparent bg-transparent px-1 py-0 text-xs text-muted hover:text-secondary"
              >
                <option value="" disabled>
                  {t(loading ? "common.loading" : "worktree.title")}
                </option>
                {selection.options.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
              </ThemedSelect>
            </div>
            <button
              type="button"
              disabled={loading}
              aria-label={t("worktree.refresh")}
              title={t("worktree.refresh")}
              onClick={() => void refresh()}
              className="app-button-ghost h-6 w-6 shrink-0 p-0 text-muted hover:text-secondary"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            </button>
          </>
        )}
        {project && (
          <button
            type="button"
            title={t("worktree.removeProject", { name: project.name })}
            aria-label={t("worktree.removeProject", { name: project.name })}
            onClick={() => onRemove(project)}
            className="app-button-ghost h-6 w-6 shrink-0 p-0 text-muted hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-danger">
          {error}
        </p>
      )}
      {!projects.length && (
        <p className="text-xs text-muted">{t("sidebar.openProjectHint")}</p>
      )}
    </div>
  );
}
