// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { ProjectSkillEntryIssues } from "./ProjectSkillEntryIssues";
import type { ProjectLibraryStatus } from "../lib/tauri";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
it("explains actual entry mismatches with Agent names and paths", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const status: ProjectLibraryStatus["skills"][number] = {
    name: "demo",
    directory: "demo",
    modified: false,
    disabled: false,
    targets: ["claude_code", "codex"],
    stale_targets: ["claude_code", "codex"],
    target_issues: [
      {
        agent: "claude_code",
        agent_name: "Claude Code",
        path: ".claude/skills/demo",
        reason: "link_replaced",
      },
      {
        agent: "codex",
        agent_name: "Codex",
        path: ".codex/skills/demo",
        reason: "content_mismatch",
      },
    ],
  };
  try {
    await act(async () =>
      root.render(<ProjectSkillEntryIssues status={status} />),
    );
    expect(container.textContent).toContain(
      "Claude Code：原先共享项目技能的链接已变成独立副本",
    );
    expect(container.textContent).toContain("Codex：技能副本与项目版本不同");
    expect(
      container.querySelector('[title=".claude/skills/demo"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
