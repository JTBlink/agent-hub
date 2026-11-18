import type { AutomationDraft } from "../../../src/lib/tauri";
import { updateAutomationPrompts } from "../../../src/lib/automationPrompts";

export function automationDraft(): AutomationDraft {
  const draft: AutomationDraft = {
    name: "项目代码审查",
    description: "定期检查待审查改动，按所选提示词完成审查或修复。",
    provider: "system",
    content: "sh './scripts/run.sh'",
    workdir: "~/projects/demo",
    schedule: { kind: "interval", minutes: 60 },
    enabled: false,
    files: [{ path: "prompts/prompt.md", content: "" }],
  };
  return {
    ...draft,
    ...updateAutomationPrompts(
      draft,
      [
        {
          id: "review",
          name: "仅审查",
          content:
            "读取项目规范，检查当前待审查的改动，报告可定位的问题和验证建议。",
        },
        {
          id: "repair",
          name: "审查后修复",
          content: "读取项目规范，先审查改动，再按已授权范围修复并验证。",
        },
        {
          id: "fix",
          name: "仅修复",
          content: "根据已确认的审查结论修复问题，执行相关验证并交回结果。",
        },
      ],
      "review",
    ),
  };
}
