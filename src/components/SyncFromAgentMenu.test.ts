import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SyncFromAgentMenu } from "./SyncFromAgentMenu";
import type { ToolInfo } from "../lib/tauri";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../lib/tauri", () => ({ syncSkillToTool: vi.fn() }));

it("shows a sync entry even when no other agents are available", () => {
  const html = renderToStaticMarkup(
    createElement(SyncFromAgentMenu, {
      currentAgentKey: "hermes",
      tools: [],
      managedSkills: [],
      onComplete: vi.fn(),
    }),
  );
  expect(html).toContain('title="globalWorkspace.syncFromAgent.button"');
  expect(html).toContain('aria-label="globalWorkspace.syncFromAgent.title"');
  expect(html).toContain('disabled=""');
});

it("keeps the source menu accessible for a coding agent from a lobster workspace", () => {
  const source: ToolInfo = {
    key: "claude_code",
    display_name: "Claude Code",
    installed: true,
    enabled: true,
    category: "coding",
    skills_dir: "<workspace>/skills",
    is_custom: false,
    has_path_override: false,
    project_relative_skills_dir: null,
    has_project_path_override: false,
  };
  const html = renderToStaticMarkup(
    createElement(SyncFromAgentMenu, {
      currentAgentKey: "hermes",
      tools: [source],
      managedSkills: [],
      onComplete: vi.fn(),
    }),
  );
  expect(html).toContain('title="globalWorkspace.syncFromAgent.button"');
  expect(html).toContain('aria-label="globalWorkspace.syncFromAgent.title"');
  expect(html).not.toContain('disabled=""');
});
