import { createInstance } from "i18next";
import { expect, it, vi } from "vitest";
import { makeProject } from "../../tests/fixtures/workspace";
import { applicationMenuOptions } from "./applicationMenu";
import type { MenuOptions } from "@tauri-apps/api/menu";
import zh from "../i18n/zh.json";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
function setup(mac = true) {
  const project = makeProject();
  const actions = {
    openProject: vi.fn(),
    openRecent: vi.fn(),
    manageWorkspaces: vi.fn(),
    navigate: vi.fn(),
    commands: vi.fn(),
    closeWindow: vi.fn(),
    quit: vi.fn(),
    developerTools: vi.fn(),
  };
  return {
    actions,
    project,
    options: applicationMenuOptions(i18n.t, [project], actions, mac),
  };
}
function items(options: MenuOptions): NonNullable<MenuOptions["items"]> {
  return (options.items ?? []).flatMap((item) =>
    "items" in item && Array.isArray(item.items)
      ? [item, ...items({ items: item.items })]
      : [item],
  );
}
it("provides native menu categories and connects open, recent, management and safe quit actions", () => {
  const { actions, project, options } = setup();
  expect(
    options.items?.map((item) => ("text" in item ? item.text : "")),
  ).toEqual(["agent-hub", "文件", "编辑", "视图", "窗口", "帮助"]);
  const all = items(options);
  for (const [label, action] of [
    ["打开项目…", actions.openProject],
    ["管理工作区…", actions.manageWorkspaces],
    ["退出 AgentHub", actions.quit],
  ] as const) {
    const item = all.find((item) => "text" in item && item.text === label);
    if (!item || !("action" in item)) throw new Error("Missing menu action");
    item.action?.("test");
    expect(action).toHaveBeenCalledOnce();
  }
  const recent = all.find(
    (item) => "id" in item && item.id === `recent-project-${project.id}`,
  );
  if (!recent || !("action" in recent))
    throw new Error("Missing recent project");
  recent.action?.("test");
  expect(actions.openRecent).toHaveBeenCalledWith(project);
  expect(all.some((item) => "item" in item && item.item === "Quit")).toBe(
    false,
  );
});
it("puts Quit under File on other platforms", () => {
  const { options } = setup(false);
  expect(
    options.items?.map((item) => ("text" in item ? item.text : "")),
  ).toEqual(["文件", "编辑", "视图", "窗口", "帮助"]);
  expect(
    items(options).filter((item) => "id" in item && item.id === "app-quit"),
  ).toHaveLength(1);
});

it.each([true, false])("opens developer tools from Help on macOS=%s", (mac) => {
  const { options, actions } = setup(mac);
  const help = options.items?.find(
    (item) => "text" in item && item.text === "帮助",
  );
  if (!help || !("items" in help) || !Array.isArray(help.items))
    throw new Error("Missing Help menu");
  const developer = help.items.find(
    (item) => "id" in item && item.id === "developer-mode",
  );
  if (!developer || !("action" in developer))
    throw new Error("Missing developer mode");
  expect(developer.text).toBe("开发者模式");
  expect(developer.accelerator).toBe("CmdOrCtrl+Alt+I");
  developer.action?.("developer-mode");
  expect(actions.developerTools).toHaveBeenCalledOnce();
});
