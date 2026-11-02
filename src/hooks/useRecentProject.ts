import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { removeProject, touchProjectVisited, type Project } from "../lib/tauri";
import {
  getProjectWorktrees,
  projectCheckoutRoute,
  worktreeUrl,
} from "../lib/worktreeApi";
import { lastWorkspace } from "../lib/lastWorkspace";
import { cacheProjectWorktrees } from "./useProjectWorktrees";

/** Validate a recent entry before opening it; unavailable records are removed only after confirmation. */
export function useRecentProject() {
  const { t } = useTranslation();
  const { projects, refreshProjects } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [missing, setMissing] = useState<{
    project: Project;
    scope: string;
  } | null>(null);
  const [removalError, setRemovalError] = useState("");
  const [checking, setChecking] = useState(false);
  const revision = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    revision.current += 1;
    return () => {
      revision.current += 1;
    };
  }, [location.key]);
  const enter = (project: Project) => {
    navigate(worktreeUrl(project.id, project.path));
    void touchProjectVisited(project.id)
      .then(refreshProjects)
      .catch(() => {});
  };
  const openRecent = async (project: Project) => {
    if (pending.current) return;
    pending.current = true;
    setChecking(true);
    const token = revision.current;
    try {
      const worktrees = await getProjectWorktrees(project.id);
      if (token !== revision.current) return;
      if (!worktrees.length) throw new Error("unavailable");
      cacheProjectWorktrees(project.id, worktrees);
      if (worktrees.every((tree) => !tree.available)) {
        setRemovalError("");
        setMissing({ project, scope: location.key });
      } else enter(project);
    } catch {
      if (token === revision.current)
        toast.error(t("worktree.missingDirectory.accessDescription"));
    } finally {
      pending.current = false;
      setChecking(false);
    }
  };
  const missingProject =
    missing?.scope === location.key ? missing.project : null;
  const removeMissingProject = async () => {
    if (!missingProject) return;
    const token = revision.current;
    setRemovalError("");
    try {
      // A folder restored while the confirmation was open is usable again.
      const worktrees = await getProjectWorktrees(missingProject.id);
      if (token !== revision.current) return;
      if (!worktrees.length) throw new Error("unavailable");
      cacheProjectWorktrees(missingProject.id, worktrees);
      if (worktrees.some((tree) => tree.available)) {
        setMissing(null);
        enter(missingProject);
        return;
      }
      await removeProject(missingProject.id);
      await refreshProjects();
      if (token !== revision.current) return;
      setMissing(null);
      const current =
        projectCheckoutRoute(location.pathname, location.search)?.projectId ??
        (["/terminal", "/git"].includes(location.pathname)
          ? lastWorkspace(projects)?.project.id
          : undefined);
      if (!current || current === missingProject.id)
        navigate("/", { replace: true });
    } catch {
      if (token === revision.current)
        setRemovalError(t("worktree.missingDirectory.removeFailed"));
      return false;
    }
  };
  return {
    openRecent,
    missingProject,
    removalError,
    checking,
    dismissMissingProject: () => setMissing(null),
    removeMissingProject,
  };
}
