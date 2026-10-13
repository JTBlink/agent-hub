import type { Project, ToolCategory, ToolInfo } from "../../src/lib/tauri";

export function makeTool(
  key: string,
  category: ToolCategory = "coding",
): ToolInfo {
  return {
    key,
    category,
    display_name: key,
    installed: true,
    enabled: true,
    skills_dir: "<workspace>/skills",
    is_custom: false,
    has_path_override: false,
    project_relative_skills_dir: null,
    has_project_path_override: false,
  };
}

export function makeProject(): Project {
  return {
    id: "demo",
    name: "Demo Project",
    path: "<workspace>/demo",
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: 0,
    skill_count: 0,
    created_at: 1,
    updated_at: 1,
    sync_health: {
      in_sync: 0,
      project_newer: 0,
      center_newer: 0,
      diverged: 0,
      project_only: 0,
    },
  };
}
