import { describe, expect, it } from "vitest";

import type { DiagnosticRecoveryPreview, UnifiedDiagnostic } from "./backend";
import {
  compactUserPath,
  diagnosticRecoveryPresentation,
} from "./diagnostic-recovery-presentation";

describe("diagnostic recovery presentation", () => {
  it("explains a Skill refresh as a structured read-only scan", () => {
    const preview: DiagnosticRecoveryPreview = {
      recoveryId: "recovery-1",
      plan: {
        diagnosticCode: "skill:codex-legacy-location",
        action: "refresh_skill_source",
        resourcePath: "~/.codex/skills/.system/imagegen/SKILL.md",
        safety: "safe",
        previewRequired: true,
        confirmationRequired: false,
      },
      summary: "重新扫描当前 Skill 来源状态",
      nextCommand: null,
      configPreview: null,
    };
    const diagnostic: UnifiedDiagnostic = {
      code: "skill:codex-legacy-location",
      kind: "source_unavailable",
      severity: "warning",
      agent: "codex",
      scope: "global",
      resourcePath: preview.plan.resourcePath,
      impact: "旧版目录",
      nextAction: "迁移",
      fixSafety: "requires_confirmation",
    };

    const result = diagnosticRecoveryPresentation(preview, diagnostic);

    expect(result.title).toBe("重新扫描 imagegen");
    expect(result.readOnly).toBe(true);
    expect(result.safetyNote).toContain("不会修改配置");
    expect(result.details).toEqual([
      { label: "问题对象", value: "imagegen" },
      { label: "Agent", value: "Codex" },
      { label: "作用域", value: "全局" },
      {
        label: "安装目录",
        value: "~/.codex/skills/.system/imagegen",
        mono: true,
      },
      { label: "入口文件", value: "SKILL.md", mono: true },
    ]);
    expect(result.actionLabel).toBe("重新扫描并刷新诊断");
  });

  it("derives a compact home path without embedding a real username", () => {
    const machinePath = ["", "home", "test-account", ".agenthub", "backups"].join(
      "/",
    );

    expect(compactUserPath(machinePath)).toBe("~/.agenthub/backups");
    expect(compactUserPath("/tmp/agenthub/backups")).toBe(
      "/tmp/agenthub/backups",
    );
  });
});
