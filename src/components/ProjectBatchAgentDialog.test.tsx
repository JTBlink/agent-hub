// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ProjectAgentTarget } from "../lib/tauri";
import type { BatchProjectSkill } from "../lib/projectBatchAgents";
import { ProjectBatchAgentDialog } from "./ProjectBatchAgentDialog";

const actions = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("../lib/projectBatchAgents", () => ({
  applyProjectBatchAgents: actions.apply,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

const targets: ProjectAgentTarget[] = [
  {
    key: "claude_code",
    display_name: "Claude Code",
    installed: true,
    enabled: true,
    is_custom: false,
  },
  {
    key: "codex",
    display_name: "Codex",
    installed: true,
    enabled: false,
    is_custom: false,
  },
  {
    key: "cursor",
    display_name: "Cursor",
    installed: false,
    enabled: true,
    is_custom: false,
  },
];
const skills: BatchProjectSkill[] = [
  {
    name: "demo-one",
    centerSkillIds: ["skill-1"],
    variants: [
      {
        agent: "claude_code",
        agent_display_name: "Claude Code",
        relative_path: "demo-one",
        enabled: true,
      },
    ],
  },
  { name: "demo-two", centerSkillIds: ["skill-2"], variants: [] },
];
const onClose = vi.fn();
const onComplete = vi.fn();
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  actions.apply.mockResolvedValue({ changed: 1, errors: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(enabled = true, availableTargets = targets) {
  await act(async () =>
    root.render(
      <ProjectBatchAgentDialog
        projectId="demo-project"
        skills={skills}
        targets={availableTargets}
        enabled={enabled}
        onClose={onClose}
        onComplete={onComplete}
      />,
    ),
  );
}
function applyButton() {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].at(-1)!;
}

it.each([true, false])(
  "filters and submits only installed enabled targets in enabled=%s mode",
  async (enabled) => {
    await render(enabled);
    const rows = container.querySelectorAll("label");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Claude Code");
    expect(rows[0].textContent).toContain("1 / 2 已启用");
    expect(container.textContent).not.toContain("Codex");
    expect(container.textContent).not.toContain("Cursor");
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await act(async () => applyButton().click());
    expect(actions.apply).toHaveBeenCalledWith(
      "demo-project",
      skills,
      ["claude_code"],
      enabled,
      expect.any(Function),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  },
);

it.each(["disabled", "removed"])(
  "clears a previously selected target when it is %s",
  async (mode) => {
    await render();
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    expect(applyButton().disabled).toBe(false);
    await render(
      true,
      mode === "removed" ? [] : [{ ...targets[0], enabled: false }],
    );
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("当前没有已启用的 Agent");
    expect(applyButton().disabled).toBe(true);
    await act(async () => applyButton().click());
    expect(actions.apply).not.toHaveBeenCalled();
    await render();
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .checked,
    ).toBe(false);
  },
);
