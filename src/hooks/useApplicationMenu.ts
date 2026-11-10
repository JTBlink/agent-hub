import { useEffect, useLayoutEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import {
  applicationMenuOptions,
  installApplicationMenu,
} from "../lib/applicationMenu";
import { useOpenProject } from "./useOpenProject";
import { useRecentProject } from "./useRecentProject";
import {
  openWorkspaceWindow,
  pickDirectory,
  toggleDeveloperTools,
  type Project,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function useApplicationMenu(
  onCommands: () => void,
  onManageWorkspaces: () => void,
) {
  const { t } = useTranslation();
  const { projects } = useApp();
  const navigate = useNavigate();
  const { openProject } = useOpenProject();
  const recent = useRecentProject();
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
    openRecent: (project: Project) => void recent.openRecent(project),
    openProject: () => void openProject(),
    newWorkspaceWindow: () => {
      void (async () => {
        const path = await pickDirectory();
        if (path) await openWorkspaceWindow(path);
      })().catch((error) =>
        toast.error(getErrorMessage(error, t("common.requestFailed"))),
      );
    },
    closeWindow: () => {
      void getCurrentWindow()
        .emitTo(
          { kind: "Window", label: getCurrentWindow().label },
          "window-close-requested",
        )
        .catch(console.error);
    },
    quit: () => {
      void getCurrentWindow()
        .emitTo(
          { kind: "Window", label: getCurrentWindow().label },
          "app-exit-requested",
        )
        .catch(console.error);
    },
  };
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
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
      newWorkspaceWindow: () => latest.current.newWorkspaceWindow(),
      closeWindow: () => latest.current.closeWindow(),
      quit: () => latest.current.quit(),
    };
    const install = async () => {
      const menu = await installApplicationMenu(
        applicationMenuOptions(
          t,
          projects,
          actions,
          navigator.userAgent.includes("Mac"),
          getCurrentWindow().label,
        ),
      );
      if (disposed) {
        await menu.close();
        return;
      }
      const previous = installed;
      installed = menu;
      if (await getCurrentWindow().isFocused()) await menu.setAsAppMenu();
      if (!navigator.userAgent.includes("Mac"))
        await menu.setAsWindowMenu(getCurrentWindow());
      await previous?.close();
    };
    const onError = (error: unknown) => {
      console.error("Failed to install application menu", error);
      if (!disposed) toast.error(t("menu.failed"));
    };
    const current = getCurrentWindow();
    const focus = current.onFocusChanged(({ payload }) => {
      if (payload && installed) void installed.setAsAppMenu().catch(onError);
    });
    void install().catch(onError);
    return () => {
      disposed = true;
      void focus.then((unlisten) => unlisten()).catch(console.error);
      void installed?.close().catch(console.error);
    };
  }, [projects, t]);
  return recent;
}
