import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { ProjectEnabledAgents } from "./ProjectEnabledAgents";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
it("shows readable enabled agent names even when the card is in multi-select mode", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectEnabledAgents, {
      variants: [
        {
          agent: "codex",
          agent_display_name: "Codex",
          relative_path: "demo",
          enabled: true,
        },
        {
          agent: "hermes",
          agent_display_name: "Hermes Agent",
          relative_path: "demo",
          enabled: false,
        },
      ],
    }),
  );
  expect(html).toContain("项目已启用：Codex");
  expect(html).not.toContain("Hermes Agent");
});
it("explicitly reports no enabled agents for disabled skills", () => {
  expect(
    renderToStaticMarkup(createElement(ProjectEnabledAgents, { variants: [] })),
  ).toContain("项目已启用：无");
});
