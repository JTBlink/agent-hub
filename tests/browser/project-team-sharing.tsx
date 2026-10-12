import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ManagedSkill, ProjectLibraryStatus } from "../../src/lib/tauri";
import "../../src/index.css";

// Actual product components with synthetic IPC; never touches project files.
const harness = {
  deployments: [] as string[],
  copied: "",
  errors: [] as string[],
};
window.addEventListener("error", (event) => harness.errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  harness.errors.push(String(event.reason)),
);
const report: ProjectLibraryStatus = {
  skills: [],
  files_to_commit: [],
  management_files: [],
  ignored_paths: [],
};
Object.assign(window, {
  teamSharingHarness: harness,
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: Record<string, unknown>) => {
      if (command === "get_settings") return "zh";
      if (command === "slugify_skill_names") return args.names;
      if (command === "get_project_library_status") return report;
      if (command === "export_skill_to_project") {
        harness.deployments.push(String(args.skillId));
        report.files_to_commit = [
          ".agents/skills/demo",
          ".claude/skills/demo",
          ".agent-hub/project-skills.json",
        ];
        report.management_files = [".agent-hub/project-skills.json"];
        report.ignored_paths = [
          ".claude/skills/demo",
          ".agent-hub/project-skills.json",
        ];
      }
      if (command === "plugin:clipboard-manager|write_text")
        harness.copied = String(args.text);
    },
  },
});
const { i18nReady } = await import("../../src/i18n/index");
await i18nReady;
const { AddSkillsSheet } = await import("../../src/components/AddSkillsSheet");
const { ProjectLibraryPanel } =
  await import("../../src/components/ProjectLibraryPanel");
const { Toaster } = await import("sonner");
const demo: ManagedSkill = {
  id: "demo",
  name: "demo",
  description: "团队代码审查技能",
  version: "1.0.0",
  source_type: "local",
  source_ref: null,
  source_ref_resolved: null,
  source_subpath: null,
  source_branch: null,
  source_revision: null,
  source_agent: null,
  remote_revision: null,
  update_status: "local_only",
  last_checked_at: null,
  last_check_error: null,
  central_path: "~/skills/demo",
  enabled: true,
  created_at: 0,
  updated_at: 0,
  status: "ok",
  targets: [],
  skill_group_ids: [],
  tags: [],
};
export function Preview() {
  const [open, setOpen] = useState(true);
  const [refresh, setRefresh] = useState(0);
  return (
    <main className="min-h-screen bg-background p-6 text-primary">
      <h1 className="mb-4 text-lg">demo-project</h1>
      <ProjectLibraryPanel
        projectId="demo-project"
        refreshKey={refresh}
        onChanged={async () => {}}
      />
      <AddSkillsSheet
        open={open}
        onClose={() => setOpen(false)}
        managedSkills={[demo]}
        onInstalled={() => setRefresh((value) => value + 1)}
        target={{
          kind: "project",
          projectId: "demo-project",
          projectName: "demo-project",
          teamSharing: true,
          exportTargets: [
            {
              key: "claude_code",
              display_name: "Claude Code",
              enabled: true,
              installed: true,
              is_custom: false,
            },
          ],
          projectSkillDirNamesByAgent: {},
          projectCenterSkillIdsByAgent: {},
          initialSelectedAgents: ["claude_code"],
          onPersistLastUsed: () => {},
        }}
      />
      <Toaster />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
