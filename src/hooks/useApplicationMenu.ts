import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import {
  applicationMenuOptions,
  installApplicationMenu,
} from "../lib/applicationMenu";
import { openProjectFolder } from "../lib/openProject";
import {
  toggleDeveloperTools,
  touchProjectVisited,
  type Project,
} from "../lib/tauri";
import { worktreeUrl } from "../lib/worktreeApi";
import { getErrorMessage } from "../lib/error";

export function useApplicationMenu(
  onCommands: () => void,
  onManageWorkspaces: () => void,
) {
  const { t } = useTranslation();
  const { projects, refreshProjects } = useApp();
  const navigate = useNavigate();
  const opening = useRef(false);
  const handlers = {
    navigate: (path: string) => {
      void navigate(path);
    },
    commands: onCommands,
    developerTools: () => {
      void toggleDeveloperTools().catch((error) => {
        toast.error(getErrorMessage(error, t("common.requestFailed")));
      });
    },
    manageWorkspaces: onManageWorkspaces,
    openRecent: (project: Project) => {
      navigate(worktreeUrl(project.id, project.path));
      void touchProjectVisited(project.id)
        .then(refreshProjects)
        .catch(() => {});
    },
    openProject: () => {
      if (opening.current) return;
      opening.current = true;
      void (async () => {
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
        }
      })();
    },
    closeWindow: () => {
      void emit("window-close-requested").catch(console.error);
    },
    quit: () => {
      void emit("app-exit-requested").catch(console.error);
    },
  };
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let installed:
      Awaited<ReturnType<typeof installApplicationMenu>> | undefined;
    const actions: typeof handlers = {
      navigate: (path) => latest.current.navigate(path),
      commands: () => latest.current.commands(),
      developerTools: () => latest.current.developerTools(),
      manageWorkspaces: () => latest.current.manageWorkspaces(),
      openRecent: (project) => latest.current.openRecent(project),
      openProject: () => latest.current.openProject(),
      closeWindow: () => latest.current.closeWindow(),
      quit: () => latest.current.quit(),
    };
    void (async () => {
      const menu = await installApplicationMenu(
        applicationMenuOptions(
          t,
          projects,
          actions,
          navigator.userAgent.includes("Mac"),
        ),
      );
      if (disposed) {
        await menu.close();
        return;
      }
      installed = menu;
      await menu.setAsAppMenu();
    })().catch((error) => {
      console.error("Failed to install application menu", error);
      if (!disposed) toast.error(t("menu.failed"));
    });
    return () => {
      disposed = true;
      void installed?.close().catch(console.error);
    };
  }, [projects, t]);
}
