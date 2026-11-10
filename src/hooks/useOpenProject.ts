import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { getErrorMessage } from "../lib/error";
import { openProjectFolder } from "../lib/openProject";
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
      const opened = await openProjectFolder();
      if (!opened) return;
      const { project, directory } = opened;
      await refreshProjects(project);
      navigate(worktreeUrl(project.id, directory));
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.requestFailed")));
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  };

  return { openProject, isOpening };
}
