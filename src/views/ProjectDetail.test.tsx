// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import {
  createProjectSkill,
  createProjectLibraryStatus,
} from "../../tests/fixtures/projectSkill";
import { ProjectDetail } from "./ProjectDetail";

const api = vi.hoisted(() => ({
  scan: vi.fn(),
  update: vi.fn(),
  report: vi.fn(),
}));
const feedback = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
const app = vi.hoisted(() => ({
  projects: [
    {
      id: "project",
      name: "Demo project",
      path: "<workspace>/project",
      workspace_type: "project",
      supports_skill_toggle: true,
    },
  ],
  tools: [],
  skillGroups: [],
  managedSkills: [],
  refreshManagedSkills: vi.fn(),
  refreshSkillGroups: vi.fn(),
  refreshProjects: vi.fn(),
}));
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
vi.mock("sonner", () => ({ toast: feedback }));
vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  getProjectSkills: api.scan,
  getProjectLibraryStatus: api.report,
  getProjectAgentTargets: async () => [
    {
      key: "claude_code",
      display_name: "Claude Code",
      installed: true,
      enabled: true,
      is_custom: false,
    },
  ],
  getAllTags: async () => [],
  updateProjectSkillFromCenter: api.update,
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t }),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.scan.mockResolvedValue([
    createProjectSkill({ sync_status: "project_newer" }),
  ]);
  api.report.mockResolvedValue(createProjectLibraryStatus());
  api.update.mockReset().mockRejectedValue({
    kind: "invalid_input",
    message: "Project skill is newer than the Skills Center version",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/projects/project"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
it("asks for confirmation before restoring a newer project skill", async () => {
  await render();
  const restore = container.querySelector<HTMLButtonElement>(
    'button[aria-label="恢复中心版本"]',
  );
  expect(restore).not.toBeNull();
  await act(async () => restore?.click());
  expect(api.update).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(feedback.error).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toBe("取消");
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "取消")
      ?.click(),
  );
  expect(api.update).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});

it("forces restoration only after confirmation and refreshes the project", async () => {
  api.update.mockResolvedValue(undefined);
  await render();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="恢复中心版本"]')
      ?.click(),
  );
  const dialog = container.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("demo");
  expect(dialog.textContent).toContain("可能会丢失这些内容");
  await act(async () =>
    [...dialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "确认覆盖")
      ?.click(),
  );
  expect(api.update).toHaveBeenCalledExactlyOnceWith(
    "project",
    "demo",
    "claude_code",
    true,
  );
  expect(app.refreshProjects).toHaveBeenCalled();
  expect(api.scan).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});

it("keeps a failed forced restore open for retry", async () => {
  api.update.mockRejectedValue(new Error("Write failed"));
  await render();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="恢复中心版本"]')
      ?.click(),
  );
  let dialog = container.querySelector('[role="alertdialog"]')!;
  await act(async () =>
    [...dialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "确认覆盖")
      ?.click(),
  );
  expect(feedback.error).toHaveBeenCalledWith(
    expect.stringContaining("Write failed"),
  );
  dialog = container.querySelector('[role="alertdialog"]')!;
  expect(dialog).not.toBeNull();
  api.update.mockResolvedValue(undefined);
  await act(async () =>
    [...dialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "确认覆盖")
      ?.click(),
  );
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});
