import { expect, it, vi } from "vitest";
import { updateProjectSkillFromCenter } from "./tauri";

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

it("keeps normal restoration protected when force is omitted", async () => {
  await updateProjectSkillFromCenter("project", "demo", "codex");
  expect(invoke).toHaveBeenLastCalledWith("update_project_skill_from_center", {
    projectId: "project",
    skillRelativePath: "demo",
    agent: "codex",
    force: false,
  });
});
it("sends the explicit force choice over IPC after confirmation", async () => {
  await updateProjectSkillFromCenter("project", "demo", "codex", true);
  expect(invoke).toHaveBeenLastCalledWith("update_project_skill_from_center", {
    projectId: "project",
    skillRelativePath: "demo",
    agent: "codex",
    force: true,
  });
});
