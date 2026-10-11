import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WorkspaceSkillCard } from "./WorkspaceSkillCard";

it.each(["grid", "list"] as const)(
  "shows the group badge and full-name tooltip in %s mode",
  (viewMode) => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSkillCard, {
        viewMode,
        title: "demo-skill",
        status: {
          label: "消息工具",
          className: "bg-accent-bg text-accent-light",
        },
        onClick: () => {},
      }),
    );
    expect(html).toContain('title="消息工具"');
    expect(html).toContain("消息工具</span>");
    expect(html).not.toContain("与中心一致");
  },
);
