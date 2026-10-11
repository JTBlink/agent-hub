import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ProjectSkill } from "../lib/tauri";
import { ProjectSkillSyncActions } from "./ProjectSkillSyncActions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
function render(status: ProjectSkill["sync_status"], updatingCenter = false) {
  return renderToStaticMarkup(
    createElement(ProjectSkillSyncActions, {
      status,
      updatingCenter,
      updatingProject: false,
      onUpdateCenter: vi.fn(),
      onUpdateProject: vi.fn(),
    }),
  );
}
it("offers upload and reset for a newer project copy with accessible names", () => {
  const html = render("project_newer");
  expect(html).toContain('aria-label="project.updateCenter"');
  expect(html).toContain('aria-label="project.resetFromCenter"');
});
it("offers only the relevant direction for unmatched and center-newer skills", () => {
  expect(render("project_only")).toContain('aria-label="project.updateCenter"');
  expect(render("project_only")).not.toContain(
    'aria-label="project.updateProject"',
  );
  expect(render("center_newer")).toContain(
    'aria-label="project.updateProject"',
  );
  expect(render("center_newer")).not.toContain(
    'aria-label="project.updateCenter"',
  );
  expect(render("in_sync")).toBe("");
});
it("disables both actions while upload is running", () => {
  const html = render("diverged", true);
  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).toContain("animate-spin");
});
