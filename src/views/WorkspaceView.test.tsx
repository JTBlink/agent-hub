// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { createProjectSkill } from "../../tests/fixtures/projectSkill";
import type { ManagedSkill, ToolInfo } from "../lib/tauri";
import { WorkspaceView } from "./WorkspaceView";
import { CODING_WORKSPACE_CONFIG } from "./workspaceConfigs";

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  refreshSkills: vi.fn().mockResolvedValue(undefined),
  refreshGroups: vi.fn().mockResolvedValue(undefined),
  refreshTools: vi.fn().mockResolvedValue(undefined),
}));
const t = (key: string, options?: { count?: number }) =>
  options?.count === undefined ? key : `${key}:${options.count}`;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../lib/tauri", () => ({ getGlobalLocalSkills: mocks.scan }));
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
vi.mock("../components/AddSkillsSheet", () => ({ AddSkillsSheet: () => null }));
vi.mock("../components/SyncFromAgentMenu", () => ({
  SyncFromAgentMenu: () => null,
}));
vi.mock("../components/AgentIcon", () => ({ AgentIcon: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const tool: ToolInfo = {
  key: "codex",
  display_name: "Codex",
  installed: true,
  enabled: true,
  skills_dir: "<workspace>/agent/skills",
  is_custom: false,
  has_path_override: false,
  project_relative_skills_dir: null,
  has_project_path_override: false,
  category: "coding",
};
let skills: ManagedSkill[];
let app: {
  tools: ToolInfo[];
  managedSkills: ManagedSkill[];
  skillGroups: { id: string; name: string; skill_count: number }[];
  refreshManagedSkills: typeof mocks.refreshSkills;
  refreshSkillGroups: typeof mocks.refreshGroups;
  refreshTools: typeof mocks.refreshTools;
};
let root: Root;
let container: HTMLDivElement;
const local = (index: number) =>
  createProjectSkill({
    name: `demo-skill-${index}`,
    relative_path: `demo-skill-${index}`,
    agent: "codex",
    center_skill_id: `skill-${index}`,
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  skills = [makeSkill(1, true), makeSkill(2, true)];
  app = {
    tools: [tool],
    managedSkills: skills,
    skillGroups: [{ id: "demo-group", name: "Demo", skill_count: 2 }],
    refreshManagedSkills: mocks.refreshSkills,
    refreshSkillGroups: mocks.refreshGroups,
    refreshTools: mocks.refreshTools,
  };
  mocks.scan.mockResolvedValue([local(1)]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(agent = "codex") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/global-workspace/${agent}`]}>
        <Routes>
          <Route
            path="/global-workspace/"
            element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />}
          />
          <Route
            path="/global-workspace/:agentKey"
            element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
function group() {
  return container.querySelector('button[title="Demo"]')!;
}

it("counts actual workspace copies instead of stale deployment records", async () => {
  await render();
  expect(group().textContent).toBe("Demo1/2");
});

it("refreshes group presence and cards after a library notification with unchanged skill count", async () => {
  await render();
  mocks.scan.mockResolvedValue([local(1), local(2)]);
  app.managedSkills = skills.map((skill) => ({ ...skill }));
  await render();
  expect(mocks.scan).toHaveBeenCalledTimes(2);
  expect(group().textContent).toBe("Demo");
  expect(container.querySelectorAll("h3")).toHaveLength(2);
});

it("refreshes group membership as well as skills when the toolbar is refreshed", async () => {
  await render();
  await act(async () =>
    (
      container.querySelector(
        'button[title="settings.refresh"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(mocks.refreshGroups).toHaveBeenCalledTimes(1);
  expect(mocks.refreshSkills).toHaveBeenCalledTimes(1);
});

it("recognizes a verified local copy even before deployment records catch up", async () => {
  app.managedSkills = skills.map((skill) => ({ ...skill, targets: [] }));
  await render();
  expect(group().textContent).toBe("Demo1/2");
});

it("shares real scan results between overview counts and group status", async () => {
  await render("");
  expect(group().textContent).toBe("Demo1/2");
  expect(container.querySelector(".app-panel")?.textContent).toContain(
    "skillCount:1",
  );
  mocks.scan.mockResolvedValue([local(1), local(2)]);
  app.managedSkills = [...skills];
  await render("");
  expect(group().textContent).toBe("Demo");
  expect(container.querySelector(".app-panel")?.textContent).toContain(
    "skillCount:2",
  );
});

it("does not let an older scan undo a newer group status", async () => {
  let resolveOld!: (value: ReturnType<typeof local>[]) => void;
  mocks.scan.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  await render();
  app.managedSkills = [...skills];
  await render();
  expect(group().textContent).toBe("Demo1/2");
  await act(async () => resolveOld([local(1), local(2)]));
  expect(group().textContent).toBe("Demo1/2");
  expect(container.querySelectorAll("h3")).toHaveLength(1);
});

it("treats failed scans as unknown and a successful empty scan as absent", async () => {
  mocks.scan.mockRejectedValueOnce(new Error("scan unavailable"));
  await render();
  expect(group().querySelector(".lucide-check")).not.toBeNull();
  mocks.scan.mockResolvedValue([]);
  app.managedSkills = [...skills];
  await render();
  expect(group().querySelector(".lucide-check")).toBeNull();
  expect(group().textContent).toBe("Demo");
});
