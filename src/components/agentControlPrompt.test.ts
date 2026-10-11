import { describe, expect, it } from "vitest";
import type { AgentControlStatus } from "../lib/tauri";
import {
  agentControlCandidates,
  agentControlMode,
  isAgentControlPromptDismissed,
} from "./agentControlPrompt";

const status = (): AgentControlStatus => ({
  bundled_version: "1.1.1",
  library_skill_id: "skill-1",
  library_source_type: "git",
  library_update_available: false,
  library: {
    path: "<workspace>/skills/manage-skills",
    present: true,
    occupied: true,
    version: "1.1.1",
    outdated: false,
  },
  agents: [
    {
      key: "codex",
      display_name: "Codex",
      installed: true,
      enabled: true,
      managed: true,
      path: "~/.../manage-skills",
      present: true,
      occupied: true,
      version: "1.1.1",
      outdated: false,
    },
  ],
});

describe("agent control setup prompt", () => {
  it("shows the install entry again when a previously installed skill is absent", () => {
    expect(isAgentControlPromptDismissed("installed")).toBe(false);
  });

  it("keeps an explicitly dismissed prompt hidden", () => {
    expect(isAgentControlPromptDismissed("dismissed")).toBe(true);
  });

  it("shows the setup prompt on first use", () => {
    expect(isAgentControlPromptDismissed(null)).toBe(false);
  });

  it("checks the library path even when the database has a skill row", () => {
    const current = status();
    current.library.present = false;
    current.library.occupied = false;
    expect(agentControlMode(current, false)).toBe("install");
  });

  it("offers deployment when an agent's real target path is missing", () => {
    const current = status();
    current.agents[0].present = false;
    current.agents[0].occupied = false;
    expect(agentControlMode(current, false)).toBe("deploy");
    expect(agentControlCandidates(current).map((agent) => agent.key)).toEqual([
      "codex",
    ]);
  });

  it("prompts for an older version even after setup was dismissed", () => {
    const current = status();
    current.library.outdated = true;
    expect(agentControlMode(current, true)).toBe("update");
  });

  it("prompts for an outdated agent copy", () => {
    const current = status();
    current.agents[0].outdated = true;
    expect(agentControlMode(current, false)).toBe("update");
  });

  it("reports an untracked or occupied path for review", () => {
    const current = status();
    current.library_skill_id = null;
    expect(agentControlMode(current, false)).toBe("attention");
  });
});
