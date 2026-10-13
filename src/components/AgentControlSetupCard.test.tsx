// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { AgentControlStatus } from "../lib/tauri";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { AgentControlSetupCard } from "./AgentControlSetupCard";

const api = vi.hoisted(() => ({
  status: vi.fn(),
  settings: vi.fn(),
  skills: vi.fn(),
  sync: vi.fn(),
  refresh: vi.fn(),
}));
const skill = { ...makeSkill(1), name: "manage-skills" };
vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    tools: [],
    managedSkills: [skill],
    loading: false,
    refreshManagedSkills: api.refresh,
    openSkillDetailById: vi.fn(),
  }),
}));
vi.mock("../lib/tauri", () => ({
  getAgentControlStatus: api.status,
  getSettings: api.settings,
  getManagedSkills: api.skills,
  syncSkillToTool: api.sync,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
const status: AgentControlStatus = {
  bundled_version: "1.1.1",
  library_skill_id: skill.id,
  library_source_type: "git",
  library_update_available: false,
  library: {
    path: "/workspace/skills/manage-skills",
    present: true,
    occupied: true,
    version: "1.1.1",
    outdated: false,
  },
  agents: ["codex", "claude_code"].map((key) => ({
    key,
    display_name: key === "codex" ? "Codex" : "Claude Code",
    installed: true,
    enabled: true,
    managed: false,
    path: `/workspace/${key}/skills/manage-skills`,
    present: false,
    occupied: false,
    version: null,
    outdated: false,
  })),
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.status.mockResolvedValue(status);
  api.settings.mockResolvedValue(null);
  api.skills.mockResolvedValue([skill]);
  api.sync.mockResolvedValue(undefined);
  api.refresh.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(text: string) {
  const value = [...container.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(text),
  );
  if (!value) throw new Error(`Missing button: ${text}`);
  return value;
}
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AgentControlSetupCard />
      </MemoryRouter>,
    ),
  );
  await act(async () => button("查看详情").click());
}

it("enables the action after selecting an Agent and deploys only to that Agent", async () => {
  await render();
  expect(button("为所选 Agent 启用").disabled).toBe(true);
  await act(async () => button("Codex").click());
  expect(button("为所选 Agent 启用").disabled).toBe(false);
  await act(async () => button("为所选 Agent 启用").click());
  expect(api.sync).toHaveBeenCalledExactlyOnceWith(skill.id, "codex");
});

it("makes Agent selection explicit instead of leaving the disabled action unexplained", async () => {
  await render();
  expect(button("Codex").getAttribute("aria-pressed")).toBe("false");
  expect(container.textContent).toContain("选择 Agent");
  await act(async () => button("Codex").click());
  expect(button("Codex").getAttribute("aria-pressed")).toBe("true");
  expect(button("Codex").querySelector(".lucide-check")).not.toBeNull();
  await act(async () => button("Codex").click());
  expect(button("Codex").getAttribute("aria-pressed")).toBe("false");
  expect(button("为所选 Agent 启用").disabled).toBe(true);
});
