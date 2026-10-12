// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ProjectLibraryStatus } from "../lib/tauri";
import { ProjectLibraryPanel } from "./ProjectLibraryPanel";

const api = vi.hoisted(() => ({ status: vi.fn(), repair: vi.fn() }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboard);
vi.mock("../lib/tauri", () => ({
  getProjectLibraryStatus: api.status,
  repairProjectLibrarySkill: api.repair,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const i18n = createInstance();
await i18n.init({
  lng: "zh",
  interpolation: { escapeValue: false },
  resources: { zh: { translation: zh } },
});
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
let container: HTMLDivElement;
let root: Root;
const onChanged = vi.fn().mockResolvedValue(undefined);
const report: ProjectLibraryStatus = {
  skills: [
    {
      name: "demo",
      directory: "demo",
      modified: false,
      disabled: false,
      targets: ["claude_code"],
      stale_targets: ["claude_code"],
    },
  ],
  files_to_commit: [
    ".agents/skills/demo",
    ".claude/skills/demo",
    ".agent-hub/project-skills.json",
  ],
  ignored_paths: [".claude/skills/demo/scripts/run.sh"],
  management_files: [".agent-hub/project-skills.json"],
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.status.mockResolvedValue(report);
  api.repair.mockResolvedValue(report);
  clipboard.writeText.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(id = "project") {
  await act(async () =>
    root.render(
      <ProjectLibraryPanel
        projectId={id}
        refreshKey={null}
        onChanged={onChanged}
      />,
    ),
  );
}
it("shows team commit paths and warns about ignored resources", async () => {
  await render();
  expect(container.textContent).toContain("团队成员拉取即可使用");
  expect(container.textContent).toContain("无需安装 AgentHub");
  expect(container.textContent).toContain("技能与 Agent 入口（2 个路径）");
  expect(container.textContent).toContain("AgentHub 管理清单（可选共享）");
  expect(container.textContent).toContain(".agents/skills/demo");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "scripts/run.sh",
  );
});
it("does not treat an ignored management manifest as a blocked skill delivery", async () => {
  api.status.mockResolvedValue({
    ...report,
    ignored_paths: [".agent-hub/project-skills.json"],
  });
  await render();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("不影响团队成员使用技能");
});
it("copies only native skill paths and keeps ignored details collapsed", async () => {
  await render();
  const warning = container.querySelector('[role="alert"]');
  expect(warning?.querySelector("details")?.open).toBe(false);
  const button = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("复制技能路径"),
  );
  await act(async () => button?.click());
  expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
    ".agents/skills/demo\n.claude/skills/demo",
  );
});
it("repairs from project content and reloads the project after completion", async () => {
  await render();
  const button = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("刷新团队副本"),
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
  expect(api.repair).toHaveBeenCalledExactlyOnceWith("project", "demo");
  expect(onChanged).toHaveBeenCalledOnce();
});
it("does not display a late response for the previously selected project", async () => {
  let resolveOld: (value: ProjectLibraryStatus) => void = () => {};
  api.status.mockImplementationOnce(
    () =>
      new Promise<ProjectLibraryStatus>((resolve) => {
        resolveOld = resolve;
      }),
  );
  await render("old-project");
  api.status.mockResolvedValue({
    skills: [],
    files_to_commit: [],
    management_files: [],
    ignored_paths: [],
  });
  await render("new-project");
  await act(async () => resolveOld(report));
  expect(container.textContent).not.toContain("scripts/run.sh");
  expect(container.textContent).not.toContain("demo");
});
