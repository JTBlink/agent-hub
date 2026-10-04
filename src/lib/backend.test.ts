import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";

import {
  addWorkspace,
  executeDiagnosticRecovery,
  getAgentRuntimes,
  getClaudeGlobalConfig,
  getDiagnostics,
  listConfigHistory,
  previewConfigRestore,
  previewDiagnosticRecovery,
  restoreConfigHistory,
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

  it("reads installed Agent runtimes separately from config files", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    await getAgentRuntimes();

    expect(invoke).toHaveBeenCalledWith("scan_agent_runtimes");
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
