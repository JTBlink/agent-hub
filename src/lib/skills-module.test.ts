import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openSkillsManager } from "./skills-module";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

it("opens the bundled module without passing a path or install operation", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await openSkillsManager();
  expect(invoke).toHaveBeenCalledWith("open_skills_manager");
});
