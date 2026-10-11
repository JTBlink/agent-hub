import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  ManagedSkill,
  Project,
  SkillGroup,
  ToolInfo,
} from "../../src/lib/tauri";
import "../../src/index.css";

// Documentation-only fixture: current product components, synthetic data, no disk access.
const empty = new URLSearchParams(location.search).has("empty");
const timestamp = 1791676800;
const groups: SkillGroup[] = ["开发", "设计", "研究"].map((name, index) => ({
  id: `group-${index}`,
  name,
  description: null,
  icon: null,
  sort_order: index,
  skill_count: 4,
  created_at: timestamp,
  updated_at: timestamp,
}));
const tools: ToolInfo[] = [
  ["claude_code", "Claude Code"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
  ["opencode", "OpenCode"],
  ["hermes", "Hermes Agent"],
].map(([key, display_name]) => ({
  key,
  display_name,
  installed: true,
  enabled: true,
  skills_dir: `~/demo/${key}/skills`,
  is_custom: false,
  has_path_override: false,
  project_relative_skills_dir: ".agents/skills",
  has_project_path_override: false,
  category: key === "hermes" ? "lobster" : "coding",
}));
const entries = [
  ["code-review", "检查代码变更，关注可维护性、边界行为与回归风险。", "开发"],
  [
    "frontend-design",
    "设计清晰、有辨识度的界面，建立一致的视觉与交互语言。",
    "设计",
  ],
  ["research", "围绕问题收集一手资料，整理证据并形成可追溯的结论。", "研究"],
  ["diagnosing-bugs", "从可复现的行为出发，定位原因并验证修复效果。", "开发"],
  ["ui-ux-pro-max", "检查信息层级、布局、色彩、可访问性与交互反馈。", "设计"],
  ["docx", "创建与编辑文档，统一标题、段落、表格和页面格式。", "研究"],
  ["tdd", "用行为测试描述需求，逐步完成实现与重构。", "开发"],
  ["diagram-generator", "将流程与系统关系整理为易于理解的图示。", "设计"],
  ["pdf", "读取、合并与整理 PDF 内容，提取需要的文档信息。", "研究"],
  ["code-simplifier", "简化复杂逻辑，减少重复，保持公开行为一致。", "开发"],
  ["prototype", "用小型原型验证设计想法，快速获得可观察的反馈。", "设计"],
  ["xlsx", "整理表格与数据，使用公式生成清晰的分析结果。", "研究"],
];
const skills: ManagedSkill[] = entries.map(
  ([name, description, tag], index) => ({
    id: `skill-${index}`,
    name,
    description,
    version: "1.0.0",
    source_type: "local",
    source_ref: `~/demo/skills/${name}`,
    source_ref_resolved: `~/demo/skills/${name}`,
    source_subpath: null,
    source_branch: null,
    source_revision: null,
    source_agent: null,
    remote_revision: null,
    update_status: "up_to_date",
    last_checked_at: timestamp,
    last_check_error: null,
    central_path: `~/.agent-hub/skills/${name}`,
    enabled: true,
    created_at: timestamp,
    updated_at: timestamp - index * 60,
    status: "ok",
    targets: tools.slice(0, (index % 3) + 1).map((tool) => ({
      id: `${index}-${tool.key}`,
      skill_id: `skill-${index}`,
      tool: tool.key,
      target_path: `${tool.skills_dir}/${name}`,
      mode: "symlink",
      status: "ok",
      synced_at: timestamp,
    })),
    skill_group_ids: [groups[index % 3].id],
    tags: [tag],
  }),
);
const projects: Project[] = ["demo-web", "demo-api"].map((name, index) => ({
  id: `project-${index}`,
  name,
  path: `~/projects/${name}`,
  workspace_type: "project",
  linked_agent_name: null,
  supports_skill_toggle: true,
  sort_order: index,
  skill_count: 4,
  sync_health: {
    in_sync: 4,
    project_newer: 0,
    center_newer: 0,
    diverged: 0,
    project_only: 0,
  },
  created_at: timestamp,
  updated_at: timestamp,
}));
Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    unregisterCallback: () => {},
    invoke: async (command: string, args?: { key?: string; id?: string }) => {
      switch (command) {
        case "get_settings":
          return (
            (
              {
                language: "zh",
                theme: "dark",
                agent_control_setup_prompt: "dismissed",
              } as Record<string, string>
            )[args?.key ?? ""] ?? null
          );
        case "get_tool_status":
          return empty ? [] : tools;
        case "get_skill_groups":
          return empty ? [] : groups;
        case "get_managed_skills":
          return empty ? [] : skills;
        case "get_projects":
          return empty ? [] : projects;
        case "get_all_tags":
          return empty ? [] : ["开发", "设计", "研究"];
        case "get_active_skill_group":
        case "get_agent_control_status":
          return null;
        case "get_central_repo_path":
          return "~/.agent-hub/skills";
        case "get_central_repo_warnings":
        case "git_backup_pending_conflicts":
          return [];
        case "get_skill_group_skill_order":
          return skills
            .filter((skill) => skill.skill_group_ids.includes(args?.id ?? ""))
            .map((skill) => skill.id);
        case "check_app_update":
          return { has_update: false };
        case "git_backup_status":
          return { is_repo: false };
        case "check_all_skill_updates":
        case "log_startup_event":
        case "plugin:event|listen":
        case "plugin:event|unlisten":
          return null;
        default:
          throw new Error(`Documentation preview does not support: ${command}`);
      }
    },
  },
});
const { i18nReady } = await import("../../src/i18n/index");
await i18nReady;
const { AppProvider } = await import("../../src/context/AppContext");
const { ThemeProvider } = await import("../../src/context/ThemeContext");
const { Layout } = await import("../../src/components/Layout");
const { Dashboard } = await import("../../src/views/Dashboard");
const { MySkills } = await import("../../src/views/MySkills");
const initialRoute =
  new URLSearchParams(location.search).get("view") === "dashboard"
    ? "/"
    : "/my-skills";
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={[initialRoute]}>
    <ThemeProvider>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/my-skills" element={<MySkills />} />
          </Route>
        </Routes>
      </AppProvider>
    </ThemeProvider>
  </MemoryRouter>,
);
