import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./tauri";
import {
  applyProjectBatchAgents,
  enabledProjectAgentNames,
  type BatchProjectSkill,
} from "./projectBatchAgents";
vi.mock("./tauri", () => ({
  exportSkillToProject: vi.fn(),
  toggleProjectSkill: vi.fn(),
  deployProjectLibrarySkill: vi.fn(),
}));
const skill: BatchProjectSkill = {
  name: "demo",
  centerSkillIds: ["center-demo"],
  variants: [
    {
      agent: "claude_code",
      agent_display_name: "Claude Code",
      relative_path: "demo",
      enabled: true,
    },
    {
      agent: "codex",
      agent_display_name: "Codex",
      relative_path: "demo",
      enabled: false,
    },
  ],
};
beforeEach(() => vi.resetAllMocks());
it("enables only the selected disabled agent without changing other agents", async () => {
  await applyProjectBatchAgents(
    "project",
    [skill],
    ["codex"],
    true,
    () => "Requires center",
  );
  expect(api.toggleProjectSkill).toHaveBeenCalledExactlyOnceWith(
    "project",
    "demo",
    "codex",
    true,
  );
  expect(api.exportSkillToProject).not.toHaveBeenCalled();
});
it("installs missing agent copies from the center and skips already enabled copies", async () => {
  await applyProjectBatchAgents(
    "project",
    [skill],
    ["claude_code", "hermes", "hermes"],
    true,
    () => "Requires center",
  );
  expect(api.exportSkillToProject).toHaveBeenCalledExactlyOnceWith(
    "center-demo",
    "project",
    ["hermes"],
  );
  expect(api.toggleProjectSkill).not.toHaveBeenCalled();
});
it("disables only selected existing copies and never installs missing copies", async () => {
  await applyProjectBatchAgents(
    "project",
    [skill],
    ["claude_code", "hermes"],
    false,
    () => "Requires center",
  );
  expect(api.toggleProjectSkill).toHaveBeenCalledExactlyOnceWith(
    "project",
    "demo",
    "claude_code",
    false,
  );
  expect(api.exportSkillToProject).not.toHaveBeenCalled();
});
it("reports missing project content and continues with the next skill", async () => {
  vi.mocked(api.deployProjectLibrarySkill).mockRejectedValueOnce(
    new Error("Requires center"),
  );
  const result = await applyProjectBatchAgents(
    "project",
    [{ ...skill, centerSkillIds: [] }, skill],
    ["hermes"],
    true,
    () => "Requires center",
  );
  expect(result.errors).toEqual([
    {
      skillName: "demo",
      agentKey: "hermes",
      error: new Error("Requires center"),
    },
  ]);
  expect(result.changed).toBe(1);
});
it("keeps failed agent details and continues other agents", async () => {
  vi.mocked(api.toggleProjectSkill).mockRejectedValue(new Error("blocked"));
  const result = await applyProjectBatchAgents(
    "project",
    [skill],
    ["codex", "hermes"],
    true,
    () => "Requires center",
  );
  expect(result.errors[0].agentKey).toBe("codex");
  expect(result.changed).toBe(1);
});
it("shows enabled agent names without counting disabled copies", () => {
  expect(
    enabledProjectAgentNames([...skill.variants, skill.variants[0]]),
  ).toEqual(["Claude Code"]);
});

it("adds a missing team target using only the project library", async () => {
  const result = await applyProjectBatchAgents(
    "project",
    [{ ...skill, centerSkillIds: [] }],
    ["hermes"],
    true,
    () => "Requires center",
  );
  expect(api.deployProjectLibrarySkill).toHaveBeenCalledExactlyOnceWith(
    "project",
    "demo",
    ["hermes"],
  );
  expect(api.exportSkillToProject).not.toHaveBeenCalled();
  expect(result).toEqual({ changed: 1, errors: [] });
});
