import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Folder,
  GitBranch,
  GripVertical,
  Link2,
  LockKeyhole,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { DraggableProvided } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import { touchProjectVisited } from "../../lib/tauri";
import { worktreeLabel, worktreeUrl } from "../../lib/worktreeApi";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { cn, compactHomePath } from "../../utils";

export function ProjectTreeRow({
  project,
  dragHandleProps,
  onRemove,
}: {
  project: Project;
  dragHandleProps: DraggableProvided["dragHandleProps"];
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const active =
    location.pathname === `/project/${project.id}` ||
    location.pathname === `/project/${project.id}/skills`;
  const [expanded, setExpanded] = useState(active);
  const [previousActive, setPreviousActive] = useState(active);
  if (previousActive !== active) {
    setPreviousActive(active);
    if (active) setExpanded(true);
  }
  const { worktrees, loading, error, refresh } = useProjectWorktrees(
    expanded ? project.id : undefined,
  );
  const selected = new URLSearchParams(location.search).get("worktree");
  const open = (path?: string) => {
    void touchProjectVisited(project.id).catch(() => {});
    setExpanded(true);
    navigate(worktreeUrl(project.id, path));
  };
  return (
    <div>
      <div className="group/project flex items-center rounded-md hover:bg-surface-hover">
        <button
          type="button"
          aria-label={t("worktree.toggleProject", { name: project.name })}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="app-button-ghost h-7 w-5 shrink-0 p-0"
        >
          <ChevronRight
            size={12}
            className={cn("transition-transform", expanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          title={compactHomePath(project.path)}
          onClick={() => open()}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 py-[7px] text-left text-sm",
            active ? "font-medium text-primary" : "text-tertiary",
          )}
        >
          {project.workspace_type === "linked" ? (
            <Link2 size={14} className="shrink-0 text-muted" />
          ) : (
            <Folder size={14} className="shrink-0 text-muted" />
          )}
          <span className="truncate">{project.name}</span>
        </button>
        <div className="flex shrink-0 opacity-0 focus-within:opacity-100 group-hover/project:opacity-100">
          <div
            {...dragHandleProps}
            className="cursor-grab rounded p-1 text-muted"
          >
            <GripVertical size={12} />
          </div>
          <button
            type="button"
            aria-label={t("worktree.removeProject", { name: project.name })}
            onClick={onRemove}
            className="app-button-ghost p-1 text-muted hover:text-danger"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mb-1 ml-3 border-l border-border-subtle pl-2">
          {loading && !worktrees.length && (
            <p role="status" className="px-2 py-2 text-xs text-muted">
              {t("common.loading")}
            </p>
          )}
          {error && (
            <div className="p-2 text-xs text-danger" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="app-button-ghost mt-1 gap-1"
              >
                <RefreshCw size={12} />
                {t("common.retry")}
              </button>
            </div>
          )}
          <ul
            aria-label={t("worktree.list", { name: project.name })}
            className="space-y-0.5"
          >
            {worktrees.map((worktree) => {
              const current =
                active &&
                (selected
                  ? selected === worktree.path
                  : worktree.path === project.path || worktrees.length === 1);
              return (
                <li key={worktree.path}>
                  <button
                    type="button"
                    disabled={!worktree.available}
                    aria-current={current ? "page" : undefined}
                    title={compactHomePath(worktree.path)}
                    onClick={() => open(worktree.path)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40",
                      current
                        ? "bg-surface-active text-primary"
                        : "text-tertiary hover:bg-surface-hover hover:text-secondary",
                    )}
                  >
                    <GitBranch
                      size={13}
                      className={cn("shrink-0", current && "text-accent")}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {worktreeLabel(worktree)}
                    </span>
                    {worktree.locked && (
                      <LockKeyhole
                        size={11}
                        className="shrink-0 text-muted"
                        aria-label={t("worktree.locked")}
                      />
                    )}
                    {worktree.is_main && (
                      <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted">
                        {t("worktree.main")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
