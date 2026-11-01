import { expect, it } from "vitest";
import { createManagedSkill } from "../../tests/fixtures/managedSkill";
import { composeTaskPrompt, taskSkillOptions } from "./taskPrompt";
import type { ProjectSkill } from "./tauri";

it("preserves same-name Skill entries from different sources and normalizes their entry files", () => {
  const project: ProjectSkill = {
    name: "review",
    dir_name: "review",
    relative_path: ".agents/skills/review",
    description: null,
    path: "/projects/demo/.agents/skills/review/",
    files: [],
    enabled: true,
    agent: "codex",
    agent_display_name: "Codex",
    tags: [],
    in_center: false,
    sync_status: "project_only",
    center_skill_id: null,
  };
  const options = taskSkillOptions(
    [
      createManagedSkill({
        id: "global",
        name: "review",
        central_path: "C:\\skills\\review\\",
      }),
      createManagedSkill({ id: "same-path", central_path: project.path }),
    ],
    [project, { ...project, enabled: false, path: "/projects/disabled" }],
  );
  expect(options).toHaveLength(2);
  expect(new Set(options.map((option) => option.entryPath))).toEqual(
    new Set([
      "C:\\skills\\review\\SKILL.md",
      "/projects/demo/.agents/skills/review/SKILL.md",
    ]),
  );
  const prompt = composeTaskPrompt(
    "Check acceptance",
    options,
    "Issue #8: new context",
    {
      skills: "Skills",
      skillInstructions: "Read entries",
      task: "Issue",
    },
  );
  for (const option of options)
    expect(prompt).toContain(JSON.stringify(option.entryPath));
  expect(prompt).toContain("Read entries");
  expect(prompt).toContain("Issue #8: new context");
});
