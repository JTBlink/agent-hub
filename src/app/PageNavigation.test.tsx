import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageNavigation } from "./PageNavigation";

describe("PageNavigation", () => {
  it("renders a consistent back action, title, description, and actions", () => {
    const markup = renderToStaticMarkup(
      <PageNavigation
        backLabel="返回列表"
        onBack={() => undefined}
        eyebrow="Skills / 重复项"
        title="检查重复 Skill"
        titleId="page-title"
        titleTabIndex={-1}
        description="检查重复安装。"
        actions={<button type="button">关闭</button>}
      />,
    );

    expect(markup).toContain('class="page-navigation"');
    expect(markup).toContain("返回列表");
    expect(markup).toContain('<h1 id="page-title" tabindex="-1">');
    expect(markup).toContain("检查重复安装。");
    expect(markup).toContain('class="page-navigation-actions"');
  });
});
