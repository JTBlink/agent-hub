import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./tauri";
import { toggleProjectSkillGroup } from "./projectLibraryActions";

vi.mock("./tauri", () => ({
  getProjectLibraryStatus: vi.fn(),
  setProjectLibrarySkillEnabled: vi.fn(),
  toggleProjectSkill: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
it("re-enables the whole team skill once instead of racing dedicated and shared entries", async () => {
  vi.mocked(api.getProjectLibraryStatus).mockResolvedValue({
    skills: [
      {
        name: "demo",
        directory: "demo",
        modified: false,
        disabled: true,
        targets: ["claude_code", "cline"],
        stale_targets: [],
      },
    ],
    files_to_commit: [],
    ignored_paths: [],
  });
  const variant = (agent: string) => ({
    name: "demo",
    dir_name: "demo",
    relative_path: "demo",
    description: null,
    path: `<workspace>/${agent}/skills-disabled/demo`,
    files: ["SKILL.md"],
    enabled: false,
    agent,
    agent_display_name: agent,
    tags: [],
    in_center: false,
    sync_status: "project_only" as const,
    center_skill_id: null,
  });
  await toggleProjectSkillGroup(
    "project",
    [variant("claude_code"), variant("cline")],
    true,
    false,
  );
  expect(api.setProjectLibrarySkillEnabled).toHaveBeenCalledExactlyOnceWith(
    "project",
    "demo",
    true,
  );
  expect(api.toggleProjectSkill).not.toHaveBeenCalled();
});
