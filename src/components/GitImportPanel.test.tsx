// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { createGitRepository } from "../lib/gitRepositories";
import { createManagedSkill } from "../../tests/fixtures/managedSkill";
import zh from "../i18n/zh.json";
import { GitImportPanel } from "./GitImportPanel";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  previewGitInstall: vi.fn(),
  previewLocalGitRepository: vi.fn(),
  confirmGitInstall: vi.fn(),
  cancelGitPreview: vi.fn(),
  cancelInstall: vi.fn(),
  installLocalGitSkill: vi.fn(),
  clearGitRepositoryCache: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  },
});

const alpha = {
  rel_path: "alpha",
  repo_path: "skills/alpha",
  name: "Alpha",
  description: "First skill",
};
const beta = {
  rel_path: "beta",
  repo_path: "skills/beta",
  name: "Beta",
  description: "Second skill",
};
const first = {
  ...createGitRepository("https://git.example.invalid/team/skills.git", "Team"),
  skills: [alpha, beta],
  refreshedAt: 1,
};
const second = {
  ...createGitRepository(
    "ssh://git@other.example.invalid:11022/team/skills.git",
    "Other",
  ),
  skills: [alpha],
  refreshedAt: 1,
};
const installed = createManagedSkill({
  name: "Renamed Alpha",
  source_ref: first.url,
  source_subpath: alpha.repo_path,
});
const changed = vi.fn<() => Promise<void>>();
const openInstalled = vi.fn();
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(api.getSettings).mockResolvedValue(
    JSON.stringify({ repositories: [first, second], activeId: first.id }),
  );
  vi.mocked(api.setSettings).mockResolvedValue(undefined);
  vi.mocked(api.cancelGitPreview).mockResolvedValue(undefined);
  vi.mocked(api.clearGitRepositoryCache).mockResolvedValue(undefined);
  vi.mocked(api.previewGitInstall).mockResolvedValue({
    temp_dir: "<temp>/preview",
    skills: [alpha, beta],
  });
  vi.mocked(api.confirmGitInstall).mockResolvedValue(undefined);
  vi.mocked(api.previewLocalGitRepository).mockResolvedValue({
    path: "/projects/skills",
    skills: [alpha],
  });
  changed.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(skills: api.ManagedSkill[] = [installed]) {
  await act(async () =>
    root.render(
      <GitImportPanel
        managedSkills={skills}
        onChanged={changed}
        onOpenInstalled={openInstalled}
      />,
    ),
  );
}
function button(text: string) {
  const result = [...document.querySelectorAll("button")].find(
    (node) =>
      node.textContent === text || node.getAttribute("aria-label") === text,
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function select(node: HTMLSelectElement, value: string) {
  await act(async () => {
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it("renders inline Skill cards, filters by installation state and distinguishes equal names across repositories", async () => {
  await render();
  expect(container.querySelectorAll("article")).toHaveLength(2);
  expect(container.querySelectorAll("dialog[open]")).toHaveLength(0);
  expect(container.textContent).toContain("已安装");
  await select(
    container.querySelector<HTMLSelectElement>(
      'select[aria-label="安装状态"]',
    )!,
    "installed",
  );
  expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(container.querySelector("article")?.textContent).toContain("Alpha");
  await select(container.querySelector("select")!, second.id);
  expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(container.querySelector("article")?.textContent).not.toContain(
    "已安装",
  );
  expect(button("安装 Alpha")).toBeDefined();
});

it("opens details for an installed Skill and navigates to its existing library record", async () => {
  await render();
  await click("Alpha");
  expect(container.querySelector("dialog[open]")?.textContent).toContain(
    first.url,
  );
  expect(container.querySelector("dialog[open]")?.textContent).toContain(
    alpha.repo_path,
  );
  await click("在技能库中查看");
  expect(openInstalled).toHaveBeenCalledWith(installed.id);
});

it("installs one available card through the current repository", async () => {
  await render();
  await click("安装 Beta");
  expect(api.confirmGitInstall).toHaveBeenCalledWith(
    first.url,
    "<temp>/preview",
    [{ rel_path: beta.rel_path, name: beta.name }],
  );
  expect(changed).toHaveBeenCalledOnce();
});

it("shows an existing same-name local install from another source instead of an uninstalled card", async () => {
  const existing = createManagedSkill({
    name: "Beta",
    source_type: "local",
    source_ref: "/projects/other/beta",
  });
  await render([existing]);
  const card = [...container.querySelectorAll("article")].find((node) =>
    node.textContent?.includes("Beta"),
  );
  expect(card?.textContent).toContain("本地已存在");
  expect(button("查看 Beta")).toBeDefined();
  await select(
    container.querySelector<HTMLSelectElement>(
      'select[aria-label="安装状态"]',
    )!,
    "installed",
  );
  expect(container.querySelectorAll("article")).toHaveLength(1);
  await click("查看 Beta");
  await click("在技能库中查看");
  expect(openInstalled).toHaveBeenCalledWith(existing.id);
});

it("offers confirmed overwrite for a same-name Skill and never installs a second copy", async () => {
  await render([
    createManagedSkill({
      name: "Beta",
      source_type: "local",
      source_ref: "/projects/other/beta",
    }),
  ]);
  await click("查看 Beta");
  expect(container.querySelector("dialog[open]")?.textContent).toContain(
    "来源不同",
  );
  await click("覆盖安装");
  expect(container.querySelector("dialog[open]")?.textContent).toContain(
    "替换",
  );
  expect(api.confirmGitInstall).not.toHaveBeenCalled();
  await click("确认覆盖安装");
  expect(api.confirmGitInstall).toHaveBeenCalledWith(
    first.url,
    "<temp>/preview",
    [{ rel_path: beta.rel_path, name: "Beta", overwrite_skill_id: "skill-1" }],
  );
});

it("shows an older repository version on cards and warns before confirming a downgrade", async () => {
  const old = { ...alpha, version: "0.2.1" };
  vi.mocked(api.getSettings).mockResolvedValue(
    JSON.stringify({
      repositories: [{ ...first, skills: [old] }],
      activeId: first.id,
    }),
  );
  vi.mocked(api.previewGitInstall).mockResolvedValue({
    temp_dir: "<temp>/preview",
    skills: [old],
  });
  await render([{ ...installed, version: "0.3.0" }]);
  const card = container.querySelector("article");
  expect(card?.textContent).toContain("仓库版本较旧");
  expect(card?.textContent).toContain("0.2.1");
  expect(card?.textContent).toContain("0.3.0");
  await click("Alpha");
  expect(container.querySelector("dialog[open]")?.textContent).toContain(
    "仓库版本较旧",
  );
  await click("覆盖安装");
  const warning = container.querySelector('dialog[open] [role="alert"]');
  expect(warning?.textContent).toContain("降级");
  expect(warning?.textContent).toContain("0.3.0");
  expect(warning?.textContent).toContain("0.2.1");
  expect(api.confirmGitInstall).not.toHaveBeenCalled();
  await click("确认覆盖安装");
  expect(api.confirmGitInstall).toHaveBeenCalledWith(
    first.url,
    "<temp>/preview",
    [
      {
        rel_path: old.rel_path,
        name: installed.name,
        overwrite_skill_id: installed.id,
      },
    ],
  );
});

it("refreshes a legacy catalog before inferring version order", async () => {
  await render([{ ...installed, version: "0.3.0" }]);
  expect(container.querySelector("article")?.textContent).toContain(
    "刷新仓库以读取版本",
  );
  expect(container.textContent).not.toContain("仓库版本较旧");
  vi.mocked(api.previewGitInstall).mockResolvedValue({
    temp_dir: "<temp>/preview",
    skills: [{ ...alpha, version: "0.4.0" }],
  });
  await click("刷新");
  expect(container.querySelector("article")?.textContent).toContain(
    "仓库有较新版本",
  );
});

it("requires another confirmation when the repository version changes before overwrite", async () => {
  vi.mocked(api.getSettings).mockResolvedValue(
    JSON.stringify({
      repositories: [{ ...first, skills: [{ ...alpha, version: "0.3.0" }] }],
      activeId: first.id,
    }),
  );
  vi.mocked(api.previewGitInstall).mockResolvedValue({
    temp_dir: "<temp>/preview",
    skills: [{ ...alpha, version: "0.2.0" }],
  });
  await render([{ ...installed, version: "0.3.0" }]);
  await click("Alpha");
  await click("覆盖安装");
  await click("确认覆盖安装");
  expect(api.confirmGitInstall).not.toHaveBeenCalled();
  expect(
    container.querySelector('dialog[open] [role="alert"]')?.textContent,
  ).toContain("0.2.0");
  await click("确认覆盖安装");
  expect(api.confirmGitInstall).toHaveBeenCalledOnce();
});

it("clears batch selection when switching repositories with colliding Skill keys", async () => {
  await render();
  await click("批量选择");
  await click("选择 Beta");
  expect(container.textContent).toContain("已选择 1 项");
  await select(container.querySelector("select")!, second.id);
  expect(container.textContent).not.toContain("已选择 1 项");
  expect(button("批量选择")).toBeDefined();
});

it("adds a local repository through the native directory picker", async () => {
  await render();
  await click("添加仓库");
  await select(
    container.querySelector<HTMLSelectElement>("fieldset select")!,
    "local",
  );
  vi.mocked(open).mockResolvedValueOnce("/projects/skills");
  await click("选择 Git 仓库目录");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.previewLocalGitRepository).toHaveBeenCalledWith(
    "/projects/skills",
  );
  expect(container.querySelector("select")?.textContent).toContain(
    "本地 Git 仓库",
  );
  expect(container.querySelectorAll("article")).toHaveLength(1);
});

it("confirms clone-cache cleanup and keeps the repository entry and installed Skills", async () => {
  await render();
  await click("管理仓库");
  await click("清理克隆缓存");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "已安装的 Skills 会保留",
  );
  await click("清理克隆缓存");
  expect(api.clearGitRepositoryCache).toHaveBeenCalledWith(first.url);
  expect(container.querySelector("select")?.textContent).toContain("Team");
  expect(container.querySelectorAll("article")).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
});
