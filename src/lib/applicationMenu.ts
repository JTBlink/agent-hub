import type { TFunction } from "i18next";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import type { Project } from "./tauri";

interface Actions {
  openProject: () => void;
  openRecent: (project: Project) => void;
  manageWorkspaces: () => void;
  navigate: (path: string) => void;
  commands: () => void;
  closeWindow: () => void;
  quit: () => void;
  developerTools: () => void;
}

/** Native menus keep OS editing, window management and accessibility behavior. */
export function applicationMenuOptions(
  t: TFunction,
  projects: Project[],
  actions: Actions,
  mac: boolean,
): MenuOptions {
  const recent = [...projects]
    .filter((project) => project.workspace_type === "project")
    .sort(
      (a, b) => (b.visited_at ?? b.updated_at) - (a.visited_at ?? a.updated_at),
    )
    .slice(0, 10);
  const separator = { item: "Separator" as const };
  const quit = {
    id: "app-quit",
    text: t("menu.quit"),
    accelerator: "CmdOrCtrl+Q",
    action: actions.quit,
  };
  return {
    items: [
      ...(mac
        ? [
            {
              text: "agent-hub",
              items: [
                {
                  text: t("menu.about"),
                  action: () => actions.navigate("/settings#about"),
                },
                separator,
                {
                  text: t("sidebar.settings"),
                  accelerator: "CmdOrCtrl+,",
                  action: () => actions.navigate("/settings"),
                },
                separator,
                { item: "Services" as const },
                separator,
                { item: "Hide" as const },
                { item: "HideOthers" as const },
                { item: "ShowAll" as const },
                separator,
                quit,
              ],
            },
          ]
        : []),
      {
        text: t("menu.file"),
        items: [
          {
            id: "open-project",
            text: t("menu.openProject"),
            accelerator: "CmdOrCtrl+O",
            action: actions.openProject,
          },
          {
            text: t("menu.recentProjects"),
            enabled: recent.length > 0,
            items: recent.map((project) => ({
              id: `recent-project-${project.id}`,
              text: project.name,
              action: () => actions.openRecent(project),
            })),
          },
          {
            text: t("menu.manageWorkspaces"),
            action: actions.manageWorkspaces,
          },
          separator,
          {
            text: t("menu.closeWindow"),
            accelerator: "CmdOrCtrl+Shift+W",
            action: actions.closeWindow,
          },
          ...(!mac ? [separator, quit] : []),
        ],
      },
      {
        text: t("menu.edit"),
        items: [
          { item: "Undo" },
          { item: "Redo" },
          separator,
          { item: "Cut" },
          { item: "Copy" },
          { item: "Paste" },
          { item: "SelectAll" },
        ],
      },
      {
        text: t("menu.view"),
        items: [
          {
            text: t("workspaceSearch.query"),
            accelerator: "CmdOrCtrl+Shift+F",
            action: () =>
              window.dispatchEvent(new Event("workspace-search-open")),
          },
          {
            text: t("titleBar.searchCommands"),
            accelerator: "CmdOrCtrl+K",
            action: actions.commands,
          },
          separator,
          {
            text: t("sidebar.projects"),
            action: () => actions.navigate("/terminal"),
          },
          {
            text: t("sidebar.skillPanel"),
            action: () => actions.navigate("/my-skills"),
          },
          { text: t("tasks.title"), action: () => actions.navigate("/tasks") },
          { text: "Git", action: () => actions.navigate("/git") },
          ...(!mac
            ? [
                separator,
                {
                  text: t("sidebar.settings"),
                  action: () => actions.navigate("/settings"),
                },
              ]
            : []),
        ],
      },
      {
        text: t("menu.window"),
        items: [
          { item: "Minimize" },
          { item: "Maximize" },
          { item: "Fullscreen" },
        ],
      },
      {
        text: t("menu.help"),
        items: [
          {
            text: t("help.pageTitle"),
            action: () => actions.navigate("/help"),
          },
          separator,
          {
            id: "developer-mode",
            text: t("menu.developerMode"),
            accelerator: "CmdOrCtrl+Alt+I",
            action: actions.developerTools,
          },
        ],
      },
    ],
  };
}

export async function installApplicationMenu(options: MenuOptions) {
  const menu = await Menu.new(options);
  return menu;
}
