// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import zhTW from "../i18n/zh-TW.json";
import {
  createProjectSkill,
  createProjectLibraryStatus,
} from "../../tests/fixtures/projectSkill";
import { ProjectDetail } from "./ProjectDetail";

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    projects: [
      {
        id: "project",
        name: "Demo",
        path: "<workspace>/project",
        workspace_type: "project",
      },
    ],
    tools: [],
    skillGroups: [],
    managedSkills: [],
    refreshManagedSkills: vi.fn(),
    refreshSkillGroups: vi.fn(),
    refreshProjects: vi.fn(),
  }),
}));
vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  getProjectSkills: async () => [
    createProjectSkill({ sync_status: "project_newer" }),
  ],
  getProjectLibraryStatus: async () => createProjectLibraryStatus(),
  getProjectAgentTargets: async () => [],
  getAllTags: async () => [],
  updateProjectSkillFromCenter: async () => {
    throw {
      kind: "project_restore_required",
      message: "Local changes require confirmation",
    };
  },
}));

it.each([
  ["zh", zh, "确认覆盖"],
  ["en", en, "Confirm overwrite"],
  ["zh-TW", zhTW, "確認覆蓋"],
] as const)(
  "labels project restoration as overwrite in %s",
  async (lng, translation, label) => {
    const i18n = createInstance();
    await i18n.init({ lng, resources: { [lng]: { translation } } });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <I18nextProvider i18n={i18n}>
            <MemoryRouter initialEntries={["/projects/project"]}>
              <Routes>
                <Route path="/projects/:id" element={<ProjectDetail />} />
              </Routes>
            </MemoryRouter>
          </I18nextProvider>,
        ),
      );
      const restore = [
        ...container.querySelectorAll<HTMLButtonElement>("button"),
      ].find(
        (button) =>
          button.getAttribute("aria-label") ===
          translation.project.resetFromCenter,
      );
      expect(restore).toBeDefined();
      await act(async () => restore!.click());
      const title = [...container.querySelectorAll("h2")].find(
        (heading) =>
          heading.textContent === translation.project.restoreConfirmTitle,
      );
      expect(title).toBeDefined();
      const buttons = [
        ...title!.parentElement!.parentElement!.querySelectorAll("button"),
      ];
      expect(buttons.map((button) => button.textContent)).toContain(label);
      expect(buttons.map((button) => button.textContent)).not.toContain(
        translation.common.delete,
      );
      await act(async () =>
        buttons
          .find((button) => button.textContent === translation.common.cancel)!
          .click(),
      );
      expect(container.textContent).not.toContain(
        translation.project.restoreConfirmTitle,
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
