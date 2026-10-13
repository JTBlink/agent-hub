// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { expect, it, vi } from "vitest";
import { SkillProjectsSection } from "./SkillProjectsSection";
import zh from "../i18n/zh.json";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import type { Project, ToolInfo } from "../lib/tauri";

const api = vi.hoisted(() => ({ exportSkillToProject: vi.fn() }));
vi.mock("../lib/tauri", () => ({
  ...api,
  getProjectSkills: async () => [],
  slugifySkillNames: async (names: string[]) => names,
  getProjectAgentTargets: async () => [
    {
      key: "claude_code",
      display_name: "Claude Code",
      installed: true,
      enabled: true,
      is_custom: false,
    },
    {
      key: "codex",
      display_name: "Codex",
      installed: true,
      enabled: true,
      is_custom: false,
    },
  ],
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
const projects: Project[] = [
  {
    id: "demo-project",
    name: "Demo",
    path: "<workspace>",
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: 0,
    skill_count: 0,
    sync_health: {
      in_sync: 0,
      project_newer: 0,
      center_newer: 0,
      diverged: 0,
      project_only: 0,
    },
    created_at: 1,
    updated_at: 1,
    visited_at: null,
  },
];
const tools: ToolInfo[] = ["claude_code", "codex"].map((key) => ({
  key,
  display_name: key,
  installed: true,
  enabled: key === "claude_code",
  is_custom: false,
  skills_dir: "~/demo/skills",
  has_path_override: false,
  project_relative_skills_dir: ".agents/skills",
  has_project_path_override: false,
  category: "coding",
}));

it("uses personal enabled tools for adding from skill details even if project flags allow every target", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <SkillProjectsSection
          skill={makeSkill(1)}
          projects={projects}
          tools={tools}
        />,
      ),
    );
    expect(container.querySelector('button[title="Codex"]')).toBeNull();
    const add = container.querySelector<HTMLButtonElement>(
      'button[title="Claude Code"]',
    );
    expect(add).not.toBeNull();
    await act(async () => add!.click());
    expect(api.exportSkillToProject).toHaveBeenCalledExactlyOnceWith(
      "skill-1",
      "demo-project",
      ["claude_code"],
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
