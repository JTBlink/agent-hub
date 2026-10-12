// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ManagedSkill, ProjectAgentTarget } from "../lib/tauri";
import { AddSkillsSheet } from "./AddSkillsSheet";

const api = vi.hoisted(() => ({
  slugifySkillNames: vi.fn(),
  exportSkillToProject: vi.fn(),
  syncSkillToTool: vi.fn(),
}));
vi.mock("../lib/tauri", () => api);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./AgentIcon", () => ({ AgentIcon: () => null }));
const i18n = createInstance();
await i18n.init({
  lng: "zh",
  interpolation: { escapeValue: false },
  resources: { zh: { translation: zh } },
});
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));

function skill(name: string): ManagedSkill {
  return {
    id: name,
    name,
    description: null,
    version: null,
    source_type: "local",
    source_ref: null,
    source_ref_resolved: null,
    source_subpath: null,
    source_branch: null,
    source_revision: null,
    source_agent: null,
    remote_revision: null,
    update_status: "local_only",
    last_checked_at: null,
    last_check_error: null,
    central_path: `~/skills/${name}`,
    enabled: true,
    created_at: 0,
    updated_at: 0,
    status: "ok",
    targets: [],
    skill_group_ids: [],
    tags: [],
  };
}

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onInstalled = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.slugifySkillNames.mockImplementation(async (names: string[]) => names);
  api.exportSkillToProject.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const enabledTargets: ProjectAgentTarget[] = [
  {
    key: "claude_code",
    display_name: "Claude Code",
    enabled: true,
    installed: true,
    is_custom: false,
  },
];
async function render(
  teamSharing = true,
  exportTargets = enabledTargets,
  initialSelectedAgents = exportTargets.map((target) => target.key),
) {
  await act(async () =>
    root.render(
      <AddSkillsSheet
        open
        onClose={onClose}
        onInstalled={onInstalled}
        managedSkills={[skill("demo"), skill("other")]}
        target={{
          kind: "project",
          projectId: "project",
          projectName: "demo-project",
          teamSharing,
          exportTargets,
          projectSkillDirNamesByAgent: {},
          projectCenterSkillIdsByAgent: {},
          initialSelectedAgents,
          onPersistLastUsed: vi.fn(),
        }}
      />,
    ),
  );
}
function button(text: string) {
  const result = [...document.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}

it("shows the project and team sharing effect and deploys to an enabled Agent", async () => {
  await render();
  expect(document.body.textContent).toContain("添加技能到 demo-project");
  expect(document.body.textContent).toContain("从已启用的 Agent 中选择");
  expect(document.body.textContent).toContain("无需 AgentHub");
  await act(async () => button("全选技能").click());
  await act(async () => button("添加 2 个").click());
  expect(api.exportSkillToProject.mock.calls).toEqual([
    ["demo", "project", ["claude_code"], undefined],
    ["other", "project", ["claude_code"], undefined],
  ]);
  expect(onInstalled).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("retains failed skills for retry and does not repeat successful deployments", async () => {
  api.exportSkillToProject.mockImplementation(async (id: string) => {
    if (id === "other") throw new Error("Target conflict");
  });
  await render();
  await act(async () => button("全选技能").click());
  await act(async () => button("添加 2 个").click());
  expect(onClose).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("已选 1 个");
  api.exportSkillToProject.mockResolvedValue(undefined);
  api.exportSkillToProject.mockClear();
  await act(async () => button("添加 1 个").click());
  expect(api.exportSkillToProject).toHaveBeenCalledExactlyOnceWith(
    "other",
    "project",
    ["claude_code"],
    undefined,
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it("does not promise Git team sharing for linked workspaces", async () => {
  await render(false);
  expect(document.body.textContent).toContain("添加技能到 demo-project");
  expect(document.body.textContent).not.toContain("提交 Git 后共享");
  expect(document.body.textContent).not.toContain("团队 Agent");
});

it("offers explicit copies for teams without project symlink support", async () => {
  await render();
  const copy = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(copy).not.toBeNull();
  await act(async () => copy?.click());
  expect(document.body.textContent).toContain("再生成 Agent 副本");
  await act(async () => button("全选技能").click());
  await act(async () => button("添加 2 个").click());
  expect(api.exportSkillToProject.mock.calls).toEqual([
    ["demo", "project", ["claude_code"], true],
    ["other", "project", ["claude_code"], true],
  ]);
});

it("excludes disabled and uninstalled targets even when old selection includes them", async () => {
  await render(true, [
    ...enabledTargets,
    {
      key: "codex",
      display_name: "Codex",
      enabled: false,
      installed: true,
      is_custom: false,
    },
    {
      key: "cursor",
      display_name: "Cursor",
      enabled: true,
      installed: false,
      is_custom: false,
    },
  ]);
  expect(document.querySelector('button[title="Codex"]')).toBeNull();
  expect(document.querySelector('button[title="Cursor"]')).toBeNull();
  await act(async () => button("全选技能").click());
  await act(async () => button("添加 2 个").click());
  expect(api.exportSkillToProject.mock.calls).toEqual([
    ["demo", "project", ["claude_code"], undefined],
    ["other", "project", ["claude_code"], undefined],
  ]);
});

it("shows how to enable an Agent and blocks deployment when no target is enabled", async () => {
  await render(true, [
    {
      key: "claude_code",
      display_name: "Claude Code",
      enabled: false,
      installed: true,
      is_custom: false,
    },
  ]);
  expect(document.body.textContent).toContain("当前没有已启用的 Agent");
  expect(document.querySelector('button[title="Claude Code"]')).toBeNull();
  expect(api.exportSkillToProject).not.toHaveBeenCalled();
});

it("drops a target disabled while the window is open instead of keeping an old selection", async () => {
  await render();
  expect(document.querySelector('button[title="Claude Code"]')).not.toBeNull();
  await render(true, [{ ...enabledTargets[0], enabled: false }]);
  expect(document.querySelector('button[title="Claude Code"]')).toBeNull();
  expect(document.body.textContent).toContain("当前没有已启用的 Agent");
  expect(api.exportSkillToProject).not.toHaveBeenCalled();
});
