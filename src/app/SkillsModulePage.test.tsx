import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SkillsModulePage } from "./SkillsModulePage";

it("offers one Skills manager entry instead of a second installation workflow", () => {
  const markup = renderToStaticMarkup(<SkillsModulePage />);
  expect(markup).toContain("Skills Manager");
  expect(markup).toContain("打开 Skills 管理");
  expect(markup.match(/<button/g)).toHaveLength(1);
  expect(markup).not.toContain("生成安装计划");
});
