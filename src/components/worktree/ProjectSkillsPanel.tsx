import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

const ProjectDetail = lazy(() =>
  import("../../views/ProjectDetail").then(({ ProjectDetail }) => ({
    default: ProjectDetail,
  })),
);

/** Replaces terminal controls while project skills occupy the editor. */
export function ProjectSkillsToolbar({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t("worktree.projectSkills")}
      className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-bg-secondary px-2"
    >
      <button
        type="button"
        className="app-button-ghost gap-2 text-xs"
        onClick={onClose}
      >
        <ArrowLeft size={14} />
        {t("worktree.back")}
      </button>
      <span className="text-xs text-primary">
        {t("worktree.projectSkills")}
      </span>
    </div>
  );
}

/** Opens project skills inside the editor while the current sidebar stays mounted. */
export function ProjectSkillsPanel({ projectId }: { projectId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <Suspense fallback={null}>
        <ProjectDetail projectId={projectId} />
      </Suspense>
    </div>
  );
}
