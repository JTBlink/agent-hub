import type { ProjectLibraryStatus, ProjectSkill } from "../../src/lib/tauri";

export function createProjectSkill(
  overrides: Partial<ProjectSkill> = {},
): ProjectSkill {
  return {
    name: "demo",
    dir_name: "demo",
    relative_path: "demo",
    description: "A team skill",
    path: "<workspace>/.agents/skills/demo",
    files: ["SKILL.md"],
    enabled: true,
    agent: "claude_code",
    agent_display_name: "Claude Code",
    tags: [],
    in_center: true,
    sync_status: "in_sync",
    center_skill_id: "demo-id",
    ...overrides,
  };
}

export function createProjectLibraryStatus(
  skills: ProjectLibraryStatus["skills"] = [],
): ProjectLibraryStatus {
  return {
    skills,
    files_to_commit: [],
    management_files: [],
    ignored_paths: [],
  };
}

export function createTeamStatus(
  directory = "demo",
  stale = true,
): ProjectLibraryStatus["skills"][number] {
  return {
    name: directory,
    directory,
    modified: false,
    disabled: false,
    targets: ["claude_code"],
    stale_targets: stale ? ["claude_code"] : [],
  };
}
