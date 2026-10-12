// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { SkillGroupBar } from "./SkillGroupBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("./SkillGroupErrorsDialog", () => ({
  SkillGroupErrorsDialog: () => null,
}));

it("publishes each project skill once to its missing Agents", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const skills = [makeSkill(1), makeSkill(2)];
  const batch = vi.fn().mockResolvedValue(undefined);
  const single = vi.fn();
  try {
    await act(async () =>
      root.render(
        <SkillGroupBar
          skillGroups={[
            {
              id: "demo-group",
              name: "Demo",
              description: null,
              icon: null,
              sort_order: 0,
              skill_count: 2,
              created_at: 0,
              updated_at: 0,
            },
          ]}
          managedSkills={skills}
          agentKeys={["claude_code", "codex", "opencode", "hermes"]}
          existsInWorkspace={(skill, agent) =>
            skill.id === "skill-1" && agent === "codex"
          }
          onAddSkill={single}
          onAddSkillToAgents={batch}
          onRemoveSkill={vi.fn()}
          onComplete={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );
    await act(async () => container.querySelector("button")?.click());
    expect(single).not.toHaveBeenCalled();
    expect(batch.mock.calls).toEqual([
      [skills[0], ["claude_code", "opencode", "hermes"]],
      [skills[1], ["claude_code", "codex", "opencode", "hermes"]],
    ]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
