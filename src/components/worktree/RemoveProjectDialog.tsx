import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { removeProject, type Project } from "../../lib/tauri";
import { toast } from "sonner";
import { ConfirmDialog } from "../ConfirmDialog";

/** Remove registration metadata only; the backend retains the checkout files. */
export function RemoveProjectDialog({
  project,
  onClose,
}: {
  project: Pick<Project, "id" | "name"> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { refreshProjects } = useApp();
  const route = useMatch("/project/:id/*");
  const navigate = useNavigate();
  return (
    <ConfirmDialog
      open={project !== null}
      message={t("project.removeConfirm", { name: project?.name ?? "" })}
      onClose={onClose}
      onConfirm={async () => {
        if (!project) return;
        try {
          await removeProject(project.id);
          await refreshProjects();
          if (route?.params.id === project.id) navigate("/");
          toast.success(t("project.removed"));
        } catch (error) {
          toast.error(String(error));
          return false;
        }
      }}
    />
  );
}
