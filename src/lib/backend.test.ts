import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";

import { addWorkspace, getClaudeGlobalConfig, getDiagnostics } from "./backend";

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
});
