import { describe, expect, it } from "vitest";
import { getAgentSyncSources } from "./agentSync";
import type { ToolInfo } from "./tauri";

const tool = (key: string, category: ToolInfo["category"]): ToolInfo => ({
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
});
const skills = [
  { id: "coding-only", targets: [{ tool: "claude_code" }] },
  { id: "lobster-only", targets: [{ tool: "hermes" }] },
  { id: "shared", targets: [{ tool: "claude_code" }, { tool: "hermes" }] },
];

describe("agent sync sources", () => {
  it("lets a lone lobster agent sync missing skills from coding agents", () => {
    const sources = getAgentSyncSources(
      "hermes",
      [tool("hermes", "lobster"), tool("claude_code", "coding")],
      skills,
    );
    expect(sources.map((source) => source.key)).toEqual(["claude_code"]);
    expect(sources[0].missingSkills.map((skill) => skill.id)).toEqual([
      "coding-only",
    ]);
    expect(sources[0].total).toBe(2);
  });
  it("also allows coding agents to sync from lobster agents", () => {
    const sources = getAgentSyncSources(
      "claude_code",
      [tool("hermes", "lobster"), tool("claude_code", "coding")],
      skills,
    );
    expect(sources[0].key).toBe("hermes");
    expect(sources[0].missingSkills.map((skill) => skill.id)).toEqual([
      "lobster-only",
    ]);
  });
  it("excludes the current, disabled and uninstalled agents", () => {
    expect(
      getAgentSyncSources(
        "hermes",
        [
          tool("hermes", "lobster"),
          { ...tool("claude_code", "coding"), enabled: false },
          { ...tool("openclaw", "lobster"), installed: false },
        ],
        skills,
      ),
    ).toEqual([]);
  });
  it("keeps an up-to-date source visible without redeploying existing skills", () => {
    const source = getAgentSyncSources(
      "hermes",
      [tool("claude_code", "coding")],
      [skills[2]],
    )[0];
    expect(source.missingCount).toBe(0);
    expect(source.missingSkills).toEqual([]);
  });
});
