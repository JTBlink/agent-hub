import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import { compactHomePath } from "../../utils";
import { ConfirmDialog } from "../ConfirmDialog";

export function MissingProjectDialog({
  project,
  error,
  onClose,
  onConfirm,
}: {
  project: Project | null;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void | false>;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={!!project}
      title={t("worktree.missingDirectory.removeTitle")}
      message={t("worktree.missingDirectory.removeConfirm", {
        name: project?.name,
      })}
      details={project ? [compactHomePath(project.path)] : []}
      confirmLabel={t("worktree.missingDirectory.removeRecord")}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
