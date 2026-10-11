import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ProjectSkillBadges } from "./ProjectSkillBadges";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("keeps the complete sync label horizontal alongside a group in a wrapping badge region", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectSkillBadges, {
      status: { label: "项目较新", className: "text-amber-400" },
      disabled: false,
      groups: [
        {
          id: "group",
          name: "note-hub",
          description: null,
          icon: null,
          sort_order: 0,
          skill_count: 1,
          created_at: 0,
          updated_at: 0,
        },
      ],
    }),
  );
  expect(html).toMatch(/class="[^"]*flex-wrap[^"]*"/);
  expect(html).toMatch(
    /<span class="[^"]*shrink-0 whitespace-nowrap[^"]*">项目较新<\/span>/,
  );
  expect(html).toContain('title="note-hub"');
});
it("retains the disabled state together with the sync status", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectSkillBadges, {
      status: { label: "与中心一致", className: "text-emerald-400" },
      disabled: true,
      groups: [],
    }),
  );
  expect(html).toContain("与中心一致");
  expect(html).toContain("project.disabled");
});
