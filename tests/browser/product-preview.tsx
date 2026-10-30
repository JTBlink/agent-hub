import networkManifestCatalog from "../../automations/system/network-reset/catalog.json";
import diskCleanupManifestPackage from "../../automations/system/disk-cleanup/task.json";
import issueManifestPackage from "../../automations/engineering/agent-issue-processing/task.json";
import mrManifestPackage from "../../automations/engineering/agent-mr-processing/task.json";
import maintenanceManifestPackage from "../../automations/engineering/agent-maintenance/task.json";
import networkManifestPackage from "../../automations/system/network-reset/task.json";
import networkLauncher from "../../automations/system/network-reset/scripts/network-reset.py?raw";
import networkSetup from "../../automations/system/network-reset/scripts/setup.sh?raw";
import networkReset from "../../automations/system/network-reset/scripts/reset.sh?raw";
import networkReadme from "../../automations/system/network-reset/README.md?raw";
import maintenanceManifestCatalog from "../../automations/engineering/agent-maintenance/catalog.json";
import mrManifestCatalog from "../../automations/engineering/agent-mr-processing/catalog.json";
import mrPrompt from "../../automations/engineering/agent-mr-processing/prompt.md?raw";
import mrConfig from "../../automations/engineering/agent-mr-processing/herdr.json?raw";
import issueManifestCatalog from "../../automations/engineering/agent-issue-processing/catalog.json";
import issuePrompt from "../../automations/engineering/agent-issue-processing/prompt.md?raw";
import issueConfig from "../../automations/engineering/agent-issue-processing/herdr.json?raw";
import React from "react";
import diskCleanupManifestCatalog from "../../automations/system/disk-cleanup/catalog.json";
import diskCleanupScript from "../../automations/system/disk-cleanup/scripts/disk-cleanup.py?raw";
import herdrScript from "../../automations/_shared/herdr-agent.py?raw";
import maintenancePrompt from "../../automations/engineering/agent-maintenance/prompt.md?raw";
import maintenanceConfig from "../../automations/engineering/agent-maintenance/herdr.json?raw";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PreviewRouteMarker } from "./PreviewRouteMarker";
import type {
  ManagedSkill,
  Project,
  SkillGroup,
  ToolInfo,
  AutomationTask,
  AutomationDraft,
  AutomationTemplate,
} from "../../src/lib/tauri";
import "../../src/index.css";

const networkManifest = {
  ...networkManifestCatalog,
  ...networkManifestPackage.draft,
};
const maintenanceManifest = {
  ...maintenanceManifestCatalog,
  ...maintenanceManifestPackage.draft,
};
const mrManifest = { ...mrManifestCatalog, ...mrManifestPackage.draft };
const issueManifest = {
  ...issueManifestCatalog,
  ...issueManifestPackage.draft,
};
const diskCleanupManifest = {
  ...diskCleanupManifestCatalog,
  ...diskCleanupManifestPackage.draft,
};
const previewAgentTemplates: AutomationTemplate[] = [
  {
    manifest: maintenanceManifest,
    prompt: maintenancePrompt,
    config: maintenanceConfig,
  },
  { manifest: mrManifest, prompt: mrPrompt, config: mrConfig },
  { manifest: issueManifest, prompt: issuePrompt, config: issueConfig },
].map(({ manifest, prompt, config }) => ({
  id: manifest.id,
  title: manifest.title.zh,
  description: manifest.description.zh,
  draft: {
    name: manifest.title.zh,
    provider: "system",
    content: "sh './run.sh'",
    workdir: null,
    script_dir: null,
    schedule: { kind: "hourly", minute: manifest.schedule.minute },
    enabled: true,
    files: [
      { path: "scripts/agent.py", content: herdrScript },
      { path: "prompt.md", content: prompt },
      { path: "herdr.json", content: config },
      {
        path: "scripts/run.sh",
        content: `python3 "$AGENT_HUB_SCRIPT_DIR/${manifest.id}/agent.py"`,
      },
    ],
  },
}));

// Documentation-only fixture: current product components, synthetic data, no disk access.
const previewParams = new URLSearchParams(location.search);
if (previewParams.has("capture")) {
  const style = document.createElement("style");
  style.textContent =
    "*,*::before,*::after{transition:none!important;animation:none!important}";
  document.head.append(style);
}
const automationTasks: AutomationTask[] = [
  {
    id: "launchd:backup",
    name: "每日项目备份",
    identifier: null,
    bundle_id: null,
    icon: null,
    source: "launchd",
    origin: "external",
    can_edit: false,
    can_run: false,
    definition: null,
    revision: null,
    is_builtin: false,
    schedule: "Hour=18 Minute=0",
    project: "~/projects/demo-web",
    status: "active",
    next_run: null,
    last_run: null,
    last_result: null,
    command: "/bin/sh ~/scripts/backup.sh",
    prompt: null,
    location: "~/Library/LaunchAgents/org.example.backup.plist",
  },
  {
    id: "hermes:audit",
    name: "工作日仓库审计",
    identifier: null,
    bundle_id: null,
    icon: null,
    source: "hermes",
    origin: "external",
    can_edit: false,
    can_run: false,
    definition: null,
    revision: null,
    is_builtin: false,
    schedule: "0 9 * * 1-5",
    project: "~/projects/demo-web",
    status: "active",
    next_run: "2026-10-28T09:00:00+08:00",
    last_run: "2026-10-27T09:00:00+08:00",
    last_result: "ok",
    command: null,
    prompt:
      "检查仓库运行状况、依赖更新、失败的测试与 lint/类型检查状态。汇总发现的问题，并建议下一步行动。",
    location: "~/.hermes/cron/jobs.json",
  },
  {
    id: "hermes:health",
    name: "项目健康检查",
    identifier: null,
    bundle_id: null,
    icon: null,
    source: "hermes",
    origin: "external",
    can_edit: false,
    can_run: false,
    definition: null,
    revision: null,
    is_builtin: false,
    schedule: "@every 30m",
    project: "~/projects/demo-api",
    status: "paused",
    next_run: null,
    last_run: "2026-10-26T14:30:00+08:00",
    last_result: "ok",
    command: null,
    prompt: "检查项目健康状况并生成简明报告。",
    location: "~/.hermes/cron/jobs.json",
  },
  {
    id: "cron:cleanup",
    name: "清理临时构建产物",
    identifier: null,
    bundle_id: null,
    icon: null,
    source: "cron",
    origin: "external",
    can_edit: false,
    can_run: false,
    definition: null,
    revision: null,
    is_builtin: false,
    schedule: "0 2 * * 0",
    project: null,
    status: "unknown",
    next_run: null,
    last_run: null,
    last_result: null,
    command: "/bin/sh ~/scripts/cleanup.sh",
    prompt: null,
    location: "crontab",
  },
];
// Explicit synthetic creation record for previewing AgentHub ownership.
automationTasks[0] = {
  ...automationTasks[0],
  id: "agent_hub:11111111-1111-4111-8111-111111111111",
  origin: "agent_hub",
  last_run: "2026-10-27T09:00:00+08:00",
  last_result: "0",
  can_edit: true,
  can_run: true,
  revision: 1,
  definition: {
    name: "每日项目备份",
    provider: "system",
    content: "/bin/sh ~/scripts/backup.sh",
    workdir: "~/projects/demo-web",
    schedule: { kind: "daily", hour: 18, minute: 0, weekdays: false },
    enabled: true,
  },
};
for (const task of automationTasks.filter((task) => task.source === "hermes")) {
  task.can_edit = true;
  task.can_run = true;
  task.definition = {
    name: task.name,
    provider: "hermes",
    content: task.prompt ?? "",
    workdir: task.project,
    schedule: { kind: "custom", expression: task.schedule },
    enabled: task.status !== "paused",
  };
}
automationTasks.push({
  ...automationTasks[0],
  id: "launchd:demo-updater",
  origin: "external",
  can_edit: false,
  can_run: false,
  definition: null,
  revision: null,
  name: "示例输入法",
  identifier: "org.example.DemoUpdater.wake",
  bundle_id: "org.example.DemoUpdater",
  icon: "/icons/32x32.png",
  location: "~/Library/LaunchAgents/org.example.DemoUpdater.wake.plist",
});
automationTasks.push({
  ...automationTasks[0],
  id: "launchd:builtin",
  origin: "external",
  can_edit: false,
  can_run: false,
  definition: null,
  revision: null,
  name: "System Maintenance",
  identifier: "com.apple.maintenance",
  is_builtin: true,
  location: "/System/Library/LaunchDaemons/com.apple.maintenance.plist",
});
const empty = previewParams.has("empty");
const showUndeployed = previewParams.has("undeployed");
const timestamp = 1791676800;
const groupNames = ["开发", "设计", "研究"];
if (previewParams.has("many-groups"))
  groupNames.push(
    "自动化",
    "文档",
    "数据",
    "测试",
    "运维",
    "工具",
    "写作",
    "协作",
    "效率",
    "归档",
  );
let groups: SkillGroup[] = groupNames.map((name, index) => ({
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
    targets: (showUndeployed && index >= 5
      ? []
      : tools.slice(0, (index % 3) + 1)
    ).map((tool) => ({
      id: `${index}-${tool.key}`,
      skill_id: `skill-${index}`,
      tool: tool.key,
      target_path: `${tool.skills_dir}/${name}`,
      mode: "symlink",
      status: "ok",
      synced_at: timestamp,
    })),
    skill_group_ids:
      previewParams.has("ungrouped") && index >= 8
        ? []
        : [groups[index % 3].id],
    tags: previewParams.has("many-tags")
      ? [tag, ...Array.from({ length: 9 }, (_, i) => `demo-tag-${i + 1}`)]
      : [tag],
  }),
);
const projects: Project[] = (
  previewParams.has("many-projects")
    ? Array.from({ length: 12 }, (_, i) => `demo-project-${i + 1}`)
    : ["demo-web", "demo-api"]
).map((name, index) => ({
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
    invoke: async (
      command: string,
      args?: {
        key?: string;
        id?: string;
        ids?: string[];
        draft?: AutomationDraft;
      },
    ) => {
      switch (command) {
        case "set_automation_installation":
          return;
        case "run_automation":
          return;
        case "save_automation": {
          const draft = args?.draft;
          if (!draft) throw new Error("Missing automation definition");
          const id =
            args?.id ?? "agent_hub:22222222-2222-4222-8222-222222222222";
          const index = automationTasks.findIndex((task) => task.id === id);
          const task: AutomationTask = {
            ...automationTasks[0],
            id,
            name: draft.name,
            definition: draft,
            revision:
              (index >= 0 ? (automationTasks[index].revision ?? 0) : 0) + 1,
            source: draft.provider === "hermes" ? "hermes" : "launchd",
            origin: "agent_hub",
            can_edit: true,
            can_run: true,
            status: draft.enabled ? "active" : "paused",
            command: draft.provider === "system" ? draft.content : null,
            prompt: draft.provider === "hermes" ? draft.content : null,
            project: draft.workdir,
            schedule:
              draft.schedule.kind === "manual" ? "manual" : "0 9 * * 1-5",
          };
          if (index >= 0) automationTasks[index] = task;
          else automationTasks.push(task);
          return id;
        }
        case "remove_automation": {
          const index = automationTasks.findIndex(
            (task) => task.id === args?.id,
          );
          if (index >= 0) automationTasks.splice(index, 1);
          return;
        }
        case "get_automation_templates":
          return {
            shell: "sh",
            templates: [
              ...previewAgentTemplates,
              {
                id: networkManifest.id,
                title: networkManifest.title.zh,
                description: networkManifest.description.zh,
                draft: {
                  name: networkManifest.title.zh,
                  provider: "system",
                  content: "sh './run.sh'",
                  workdir: null,
                  schedule: {
                    kind: "daily",
                    hour: 7,
                    minute: 0,
                    weekdays: false,
                  },
                  enabled: false,
                  files: [
                    {
                      path: "scripts/network-reset.py",
                      content: networkLauncher,
                    },
                    { path: "scripts/setup.sh", content: networkSetup },
                    { path: "scripts/reset.sh", content: networkReset },
                    { path: "README.md", content: networkReadme },
                    {
                      path: "scripts/run.sh",
                      content:
                        'python3 "$AGENT_HUB_SCRIPT_DIR/network-reset/network-reset.py"',
                    },
                  ],
                },
              },
              {
                id: "disk-cleanup",
                title: "清理磁盘缓存",
                description: diskCleanupManifest.description.zh,
                draft: {
                  name: "清理磁盘缓存",
                  provider: "system",
                  content: "sh './run.sh'",
                  files: [
                    {
                      path: "scripts/disk-cleanup.py",
                      content: diskCleanupScript,
                    },
                    {
                      path: "scripts/run.sh",
                      content: "python3 './disk-cleanup/disk-cleanup.py'",
                    },
                  ],
                  workdir: null,
                  schedule: {
                    kind: "daily",
                    hour: 3,
                    minute: 0,
                    weekdays: false,
                  },
                  enabled: true,
                },
              },
            ],
          };
        case "get_automation_backups": {
          const { getAutomationTemplates } =
            await import("../../src/lib/tauri");
          const catalog = await getAutomationTemplates("zh");
          return catalog.templates.map((template) => ({
            schema_version: 1,
            id: template.id,
            shell: catalog.shell,
            draft: template.draft,
          }));
        }
        case "get_automation_history":
          return {
            kind: "executions",
            limited: false,
            runs: [
              {
                id: "20261027T010000Z-101",
                started_at: "2026-10-27T01:00:00Z",
                finished_at: "2026-10-27T01:00:02Z",
                status: "completed",
                exit_code: 0,
                has_output: true,
              },
              {
                id: "20261026T010000Z-102",
                started_at: "2026-10-26T01:00:00Z",
                finished_at: "2026-10-26T01:00:03Z",
                status: "error",
                exit_code: 1,
                has_output: true,
              },
              {
                id: "20261025T010000Z-103",
                started_at: "2026-10-25T01:00:00Z",
                finished_at: "2026-10-25T01:00:01Z",
                status: "completed",
                exit_code: 0,
                has_output: true,
              },
            ],
          };
        case "get_automation_output":
          return {
            available: true,
            kind: "system",
            truncated: false,
            content:
              "[09:00:00] 开始检查项目工作目录\n[09:00:01] 已完成文件检查：128 个文件\n[09:00:02] 备份完成，未发现错误\n",
          };
        case "get_automation_overview":
          return {
            tasks: previewParams.has("no-hermes")
              ? automationTasks.filter((task) => task.source !== "hermes")
              : automationTasks,
            issues: [],
            hermes_installed: !previewParams.has("no-hermes"),
          };
        case "get_settings":
          return (
            (
              {
                language: previewParams.get("language") ?? "zh",
                theme: previewParams.get("theme") ?? "dark",
                text_size: previewParams.get("text-size") ?? "default",
                agent_control_setup_prompt: "dismissed",
              } as Record<string, string>
            )[args?.key ?? ""] ?? null
          );
        case "fetch_skillssh_leaderboard":
          return [];
        case "get_tool_status":
          return empty ? [] : tools;
        case "get_skill_groups":
          return empty ? [] : groups;
        case "reorder_skill_groups": {
          const order = new Map(args?.ids?.map((id, index) => [id, index]));
          groups = [...groups].sort(
            (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
          );
          return null;
        }
        case "get_managed_skills":
          return empty ? [] : skills;
        case "get_projects":
          return empty ? [] : projects;
        case "get_all_tags":
          return empty
            ? []
            : [...new Set(skills.flatMap((skill) => skill.tags))];
        case "get_active_skill_group":
        case "get_agent_control_status":
          return null;
        case "get_central_repo_path":
          return "~/.agent-hub/skills";
        case "get_global_local_skills":
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
const { Automation } = await import("../../src/views/Automation");
const { Discover } = await import("../../src/views/Discover");
const { MySkills } = await import("../../src/views/MySkills");
const { WorkspaceView } = await import("../../src/views/WorkspaceView");
const { CODING_WORKSPACE_CONFIG, LOBSTER_WORKSPACE_CONFIG } =
  await import("../../src/views/workspaceConfigs");
const initialRoute =
  new URLSearchParams(location.search).get("view") === "dashboard"
    ? "/"
    : previewParams.get("view") === "discover"
      ? `/discover?type=${previewParams.get("type") ?? "automations"}&source=${previewParams.get("source") ?? "recommended"}`
      : previewParams.get("view") === "automation"
        ? `/automation${previewParams.has("task") ? `?task=${encodeURIComponent(previewParams.get("task") ?? "")}` : ""}`
        : "/my-skills";
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={[initialRoute]}>
    <ThemeProvider>
      <AppProvider>
        <PreviewRouteMarker />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/my-skills" element={<MySkills />} />
            <Route
              path="/global-workspace"
              element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />}
            />
            <Route
              path="/global-workspace/:agentKey"
              element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />}
            />
            <Route
              path="/lobster-workspace"
              element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />}
            />
            <Route
              path="/lobster-workspace/:agentKey"
              element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />}
            />
            <Route
              path="/project/:id"
              element={<div className="app-page">Demo project workspace</div>}
            />
          </Route>
        </Routes>
      </AppProvider>
    </ThemeProvider>
  </MemoryRouter>,
);

// Optional deterministic documentation states. Only clicks fixture components;
// the preview IPC above never touches files or launches commands.
const automationState = previewParams.get("automation-state");
if (automationState) {
  const waitFor = async (selector: () => HTMLElement | null) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const element = selector();
      if (element) return element;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error("Documentation preview state did not become ready");
  };
  void (async () => {
    if (automationState === "remove" || automationState === "remove-checked") {
      const remove = await waitFor(() =>
        document.querySelector<HTMLButtonElement>('[aria-label="删除自动化"]'),
      );
      remove.click();
      const checkbox = await waitFor(() =>
        document.querySelector<HTMLInputElement>(
          '[role="alertdialog"] input[type="checkbox"]',
        ),
      );
      if (automationState === "remove-checked") checkbox.click();
      return;
    }
    if (
      automationState === "execution" ||
      automationState === "execution-output"
    ) {
      const tab = await waitFor(() =>
        document.querySelector("h1")?.textContent === automationTasks[0].name
          ? document.querySelector<HTMLElement>("#automation-detail-tab-runs")
          : null,
      );
      tab.click();
      if (automationState === "execution-output") {
        const record = await waitFor(() =>
          document.querySelector<HTMLElement>(
            'button[data-run-id="20261027T010000Z-101"]',
          ),
        );
        record.click();
      }
      return;
    }
    if (automationState === "hermes") {
      const creator = await waitFor(() =>
        document.querySelector<HTMLSelectElement>(
          'select[aria-label="任务创建者"]',
        ),
      );
      if (creator instanceof HTMLSelectElement) {
        creator.value = "all";
        creator.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const filter = await waitFor(() =>
        document.querySelector<HTMLSelectElement>(
          'select[aria-label="任务来源"]',
        ),
      );
      if (filter instanceof HTMLSelectElement) {
        filter.value = "hermes";
        filter.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    if (automationState === "menu") {
      const trigger = await waitFor(() =>
        document.querySelector<HTMLElement>(
          'button[role="combobox"][aria-label="任务状态"]',
        ),
      );
      trigger.click();
      return;
    }
    const create = await waitFor(
      () =>
        [...document.querySelectorAll("button")].find(
          (node) => node.textContent === "新建自动化",
        ) ?? null,
    );
    if (automationState === "create") {
      create.click();
      return;
    }
    const more = await waitFor(() =>
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="更多操作"]',
      ),
    );
    more.click();
    const restore = await waitFor(() =>
      document.querySelector<HTMLButtonElement>('[role="menuitem"]'),
    );
    restore.click();
    const audit = await waitFor(() =>
      document.querySelector<HTMLElement>(
        automationState === "network-editor"
          ? 'button[aria-label="定时重置网络"]'
          : automationState === "cleanup-editor"
            ? 'button[aria-label="清理磁盘缓存"]'
            : automationState === "herdr-editor"
              ? 'button[aria-label="项目巡检"]'
              : 'button[aria-label="项目巡检"]',
      ),
    );
    if (
      automationState === "network-editor" ||
      automationState === "editor" ||
      automationState === "cleanup-editor" ||
      automationState === "herdr-editor"
    ) {
      audit.click();
      if (automationState === "herdr-editor") {
        const project = await waitFor(() =>
          document.querySelector<HTMLSelectElement>(
            'select[aria-label="项目工作区"]',
          ),
        );
        await waitFor(() => (project.options.length > 1 ? project : null));
        project.value = project.options[1].value;
        project.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (previewParams.has("script-files")) {
        const summary = await waitFor(
          () =>
            [...document.querySelectorAll("summary")].find((node) =>
              node.textContent?.startsWith("脚本文件"),
            ) ?? null,
        );
        const details = summary.parentElement as HTMLDetailsElement;
        details.open = true;
        summary.scrollIntoView({ block: "center" });
      }
      if (previewParams.has("capture"))
        setTimeout(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        }, 100);
    }
  })();
}

// Discover uses the actual production cards and installer; no real tasks are created.
const discoveryState = previewParams.get("discovery-state");
if (discoveryState) {
  const waitForDiscovery = async (read: () => HTMLElement | null) => {
    for (let count = 0; count < 100; count++) {
      const element = read();
      if (element) return element;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error("Discover preview state did not become ready");
  };
  void (async () => {
    const install = await waitForDiscovery(() =>
      document.querySelector('[aria-label="安装 项目巡检"]'),
    );
    install.click();
    if (discoveryState === "preview") return;
    const next = await waitForDiscovery(
      () =>
        [...document.querySelectorAll<HTMLElement>("dialog button")].find(
          (button) => button.textContent === "下一步：本机配置",
        ) ?? null,
    );
    next.click();
    if (discoveryState === "menu") {
      const menu = await waitForDiscovery(() =>
        document.querySelector(
          'dialog button[role="combobox"][aria-label="日程"]',
        ),
      );
      menu.click();
    }
  })();
}
