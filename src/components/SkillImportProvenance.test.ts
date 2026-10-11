import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { SkillImportProvenance } from "./SkillImportProvenance";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
it("keeps missing import paths as neutral provenance instead of an error", () => {
  const html = renderToStaticMarkup(
    createElement(SkillImportProvenance, {
      skill: {
        source_type: "local",
        source_ref: "~/imports/demo",
        update_status: "source_missing",
      },
      onRelink: vi.fn(),
      onDetach: vi.fn(),
    }),
  );
  expect(html).toContain("导入来源");
  expect(html).toContain("~/imports/demo");
  expect(html).toContain("不影响技能库副本的使用");
  expect(html).toContain("重新关联");
  expect(html).not.toContain("原路径丢失");
  expect(html).not.toContain("text-danger");
});
it("does not show local import provenance for remote or detached skills", () => {
  for (const skill of [
    {
      source_type: "git",
      source_ref: "example/demo",
      update_status: "up_to_date",
    },
    { source_type: "local", source_ref: null, update_status: "local_only" },
  ]) {
    expect(
      renderToStaticMarkup(createElement(SkillImportProvenance, { skill })),
    ).toBe("");
  }
});
