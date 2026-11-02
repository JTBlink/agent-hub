import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { getErrorMessage } from "../lib/error";
import { openProjectFolder } from "../lib/openProject";
import { touchProjectVisited } from "../lib/tauri";
import { worktreeUrl } from "../lib/worktreeApi";

/** Shared folder opening flow for the native menu and workspace entry points. */
export function useOpenProject() {
  const { t } = useTranslation();
  const { refreshProjects } = useApp();
  const navigate = useNavigate();
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  const openProject = async () => {
    if (opening.current) return;
    opening.current = true;
    setIsOpening(true);
    try {
      const project = await openProjectFolder();
      if (!project) return;
      await refreshProjects();
      navigate(worktreeUrl(project.id, project.path));
      void touchProjectVisited(project.id)
        .then(refreshProjects)
        .catch(() => {});
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.requestFailed")));
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  };

  return { openProject, isOpening };
}
