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
        skillId: "browser",
        skillName: "browser",
        agentKey: "claude",
        error: { kind: "target_conflict", message: reasonA },
      },
      {
        skillId: "reviewer",
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

it("offers overwrite for each target conflict while keeping ordinary failures read-only", () => {
  const notices = summarizeSkillGroupErrors(
    [
      {
        skillId: "browser",
        skillName: "browser",
        agentKey: "hermes",
        error: {
          kind: "target_conflict",
          message: "Existing content preserved",
        },
      },
      {
        skillId: "reviewer",
        skillName: "reviewer",
        agentKey: "codex",
        error: { kind: "target_conflict", message: "Another target preserved" },
      },
      {
        skillId: "writer",
        skillName: "writer",
        agentKey: "hermes",
        error: { kind: "database", message: "Database unavailable" },
      },
    ],
    "Unexpected error",
  );
  const html = renderToStaticMarkup(
    createElement(SkillGroupErrorsDialog, {
      notices,
      onClose: vi.fn(),
      onForceSync: vi.fn(),
      onComplete: vi.fn(),
    }),
  );
  expect(html.match(/skillGroupActions.forceOverride/g)).toHaveLength(2);
  expect(html).toContain("browser · hermes");
  expect(html).toContain("reviewer · codex");
  expect(html).toContain("Database unavailable");
});

it("does not offer overwrite without a deployment handler", () => {
  const notices = summarizeSkillGroupErrors(
    [
      {
        skillId: "browser",
        skillName: "browser",
        agentKey: "hermes",
        error: {
          kind: "target_conflict",
          message: "Existing content preserved",
        },
      },
    ],
    "Unexpected error",
  );
  const html = renderToStaticMarkup(
    createElement(SkillGroupErrorsDialog, { notices, onClose: vi.fn() }),
  );
  expect(html).not.toContain("skillGroupActions.forceOverride");
});
