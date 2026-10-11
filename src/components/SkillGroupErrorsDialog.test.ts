import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SkillGroupErrorsDialog } from "./SkillGroupErrorsDialog";
import { summarizeSkillGroupErrors } from "../lib/skillGroupErrors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("renders every skipped skill with its agent and complete reason", () => {
  const reasonA =
    'Refused replacement of "/workspace/claude/skills/browser": existing content preserved.';
  const reasonB =
    'Refused replacement of "/workspace/codex/skills/reviewer": import or move the existing skill and retry.';
  const notices = summarizeSkillGroupErrors(
    [
      {
        skillName: "browser",
        agentKey: "claude",
        error: { kind: "target_conflict", message: reasonA },
      },
      {
        skillName: "reviewer",
        agentKey: "codex",
        error: { kind: "target_conflict", message: reasonB },
      },
    ],
    "Unexpected error",
  );
  const html = renderToStaticMarkup(
    createElement(SkillGroupErrorsDialog, { notices, onClose: vi.fn() }),
  );
  expect(html).toContain("browser · claude");
  expect(html).toContain("reviewer · codex");
  expect(html).toContain(reasonA.replaceAll('"', "&quot;"));
  expect(html).toContain(reasonB.replaceAll('"', "&quot;"));
  expect(html.match(/<li /g)).toHaveLength(2);
  expect(html).toContain("break-all");
});
