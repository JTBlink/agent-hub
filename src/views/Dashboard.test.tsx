// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ManagedSkill } from "../lib/tauri";
import { Dashboard } from "./Dashboard";

const app = vi.hoisted(() => ({
  managedSkills: [] as ManagedSkill[],
  openSkillDetailById: vi.fn(),
}));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({ ...app, tools: [], projects: [] }),
}));
vi.mock("../components/AgentControlSetupCard", () => ({
  AgentControlSetupCard: () => null,
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

function makeSkill(index: number, deployed = false): ManagedSkill {
  return {
    id: `skill-${index}`,
    name: `demo-skill-${index}`,
    description: `Description ${index}`,
    central_path: `<workspace>/library/demo-skill-${index}`,
    source_type: "local",
    source_ref: null,
    source_ref_resolved: null,
    source_revision: null,
    remote_revision: null,
    updated_at: index,
    created_at: 1,
    version: null,
    source_subpath: null,
    source_branch: null,
    source_agent: null,
    last_checked_at: null,
    last_check_error: null,
    enabled: true,
    status: "active",
    targets: deployed
      ? [
          {
            id: `target-${index}`,
            skill_id: `skill-${index}`,
            tool: "codex",
            target_path: `<workspace>/agent/demo-skill-${index}`,
            mode: "symlink",
            status: "ok",
            synced_at: 1,
          },
        ]
      : [],
    update_status: "up_to_date",
    tags: [],
    skill_group_ids: ["demo-group"],
  };
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-skills" element={<p>Skill library</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

it("lists every undeployed skill beyond recent activity and opens its deployment details", async () => {
  app.managedSkills = [
    makeSkill(0, true),
    ...Array.from({ length: 14 }, (_, i) => makeSkill(i + 1)),
  ];
  await render();
  const overview = container.querySelector(
    'section[aria-label="技能与部署概览"]',
  )!;
  expect(overview.textContent).toContain("1/15");
  const button = overview.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"]',
  )!;
  expect(button.textContent).toContain("未部署 14");
  await act(async () => button.click());
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelectorAll("li")).toHaveLength(14);
  expect(dialog.textContent).not.toContain("demo-skill-0");
  const firstSkill = dialog.querySelector<HTMLButtonElement>("li button")!;
  expect(firstSkill.textContent).toContain("demo-skill-1");
  await act(async () => firstSkill.click());
  expect(app.openSkillDetailById).toHaveBeenCalledWith("skill-1");
  expect(container.textContent).toBe("Skill library");
});

it("keeps the undeployed list and count current when deployment data changes", async () => {
  app.managedSkills = [makeSkill(1), makeSkill(2)];
  await render();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!
      .click(),
  );
  app.managedSkills = [makeSkill(1, true), makeSkill(2)];
  await render();
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelectorAll("li")).toHaveLength(1);
  expect(dialog.textContent).toContain("未部署 1");
  expect(dialog.textContent).not.toContain("demo-skill-1");
  await act(async () =>
    dialog
      .querySelector<HTMLButtonElement>(
        'button[aria-label="关闭未部署技能列表"]',
      )!
      .click(),
  );
  expect(dialog.open).toBe(false);
});

it.each([{ skills: [] }, { skills: [makeSkill(1, true)] }])(
  "disables the list entry when no skills are undeployed",
  async ({ skills }) => {
    app.managedSkills = skills;
    await render();
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    )!;
    expect(button.textContent).toContain("未部署 0");
    expect(button.disabled).toBe(true);
    expect(container.querySelector("dialog")!.open).toBe(false);
  },
);
