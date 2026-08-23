import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";

import {
  addWorkspace,
  applySkillInstall,
  browseSkillSource,
  executeDiagnosticRecovery,
  getClaudeGlobalConfig,
  getDiagnostics,
  getLastLocalSkillSource,
  listConfigHistory,
  planSkillInstall,
  previewUninstallSkill,
  previewDiagnosticRecovery,
  previewConfigRestore,
  restoreConfigHistory,
  setSkillEnabled,
  setLastLocalSkillSource,
  uninstallSkill,
} from "./backend";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("Claude Code backend binding", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("invokes the read-only global config scan command", async () => {
    vi.mocked(invoke).mockResolvedValue({ status: "missing" });

    await getClaudeGlobalConfig();

    expect(invoke).toHaveBeenCalledWith("scan_claude_global");
  });

  it("passes typed diagnostic filters to the unified command", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    await getDiagnostics({ severity: "error", agent: "codex" });

    expect(invoke).toHaveBeenCalledWith("collect_diagnostics", {
      severity: "error",
      agent: "codex",
    });
  });

  it("adds a workspace without exposing persistence details", async () => {
    vi.mocked(invoke).mockResolvedValue({ id: 1 });

    await addWorkspace("/projects/demo");

    expect(invoke).toHaveBeenCalledWith("add_workspace", {
      path: "/projects/demo",
    });
  });

  it("persists the last local Skill source directory", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    await getLastLocalSkillSource();
    expect(invoke).toHaveBeenCalledWith("get_last_local_skill_source");

    await setLastLocalSkillSource("/projects/skills");
    expect(invoke).toHaveBeenCalledWith("set_last_local_skill_source", {
      path: "/projects/skills",
    });
  });

  it("passes an optional resource path to diagnostic filtering", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    await getDiagnostics({ resourcePath: "/projects/demo/opencode.json" });

    expect(invoke).toHaveBeenCalledWith("collect_diagnostics", {
      resourcePath: "/projects/demo/opencode.json",
    });
  });

  it("lists and restores configuration history by opaque operation id", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listConfigHistory("/projects/demo/opencode.json");
    expect(invoke).toHaveBeenCalledWith("list_config_history", {
      path: "/projects/demo/opencode.json",
    });

    vi.mocked(invoke).mockResolvedValue({ changed: true });
    await previewConfigRestore(7);
    expect(invoke).toHaveBeenCalledWith("preview_config_restore", {
      operationId: 7,
    });

    vi.mocked(invoke).mockResolvedValue({});
    await restoreConfigHistory(7, "expected-checksum");
    expect(invoke).toHaveBeenCalledWith("restore_config_history", {
      operationId: 7,
      expectedChecksum: "expected-checksum",
    });
  });

  it("uses explicit command envelopes for the Skill source and lifecycle API", async () => {
    vi.mocked(invoke).mockResolvedValue({});
    const request = { kind: "local-directory" as const, path: "/skills" };

    await browseSkillSource(request);
    expect(invoke).toHaveBeenCalledWith("browse_skill_source", { request });

    const input = {
      request,
      skillPath: "review",
      skillSourceLocator: "https://skills.sh/anthropics/skills",
      agent: "codex" as const,
      scope: "workspace" as const,
      workspaceDirectory: "/projects/demo",
      workspaceId: 7,
    };
    await planSkillInstall(input);
    expect(invoke).toHaveBeenNthCalledWith(2, "plan_skill_install", { input });

    await applySkillInstall("plan-7");
    expect(invoke).toHaveBeenNthCalledWith(3, "apply_skill_install", {
      planId: "plan-7",
    });

    await setSkillEnabled({
      targetDirectory: "/projects/demo/.agents/skills/review",
      enabled: false,
      workspaceDirectory: "/projects/demo",
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "set_skill_enabled", {
      targetDirectory: "/projects/demo/.agents/skills/review",
      enabled: false,
      workspaceDirectory: "/projects/demo",
    });

    await previewUninstallSkill({
      targetDirectory: "/projects/demo/.agents/skills/review",
      workspaceDirectory: "/projects/demo",
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "preview_uninstall_skill", {
      targetDirectory: "/projects/demo/.agents/skills/review",
      workspaceDirectory: "/projects/demo",
    });

    await uninstallSkill({
      targetDirectory: "/projects/demo/.agents/skills/review",
      workspaceDirectory: "/projects/demo",
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "uninstall_skill", {
      targetDirectory: "/projects/demo/.agents/skills/review",
      workspaceDirectory: "/projects/demo",
    });
  });

  it("keeps diagnostic recovery behind a preview ticket", async () => {
    vi.mocked(invoke).mockResolvedValue({});
    const request = {
      diagnosticCode: "cache:stale",
      resourcePath: "/tmp/cache",
    };

    await previewDiagnosticRecovery(request);
    expect(invoke).toHaveBeenCalledWith("preview_diagnostic_recovery", {
      request,
    });

    await executeDiagnosticRecovery({
      ...request,
      recoveryId: "recovery-1",
      previewed: true,
      confirmed: true,
    });
    expect(invoke).toHaveBeenCalledWith("execute_diagnostic_recovery", {
      request: {
        ...request,
        recoveryId: "recovery-1",
        previewed: true,
        confirmed: true,
      },
    });
  });
});
