import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkspaceSkillSummary } from "./WorkspaceSkillSummary";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      `${key}${values?.count === undefined ? "" : `:${values.count}`}`,
  }),
}));

it("shows the two unmanaged skills in an accessible filter button", () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceSkillSummary, {
      total: 102,
      managed: 100,
      synced: 100,
      onlyUnmanaged: false,
      onChange: vi.fn(),
    }),
  );
  expect(html).toContain("globalWorkspace.localSkills.unmanagedCount:2");
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain('title="globalWorkspace.localSkills.showUnmanaged"');
});

it("marks the unmanaged filter active and explains how to return to all skills", () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceSkillSummary, {
      total: 102,
      managed: 100,
      synced: 100,
      onlyUnmanaged: true,
      onChange: vi.fn(),
    }),
  );
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('title="globalWorkspace.localSkills.showAll"');
});
