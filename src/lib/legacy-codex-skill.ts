import type {
  LegacyCodexSkillAction,
  LegacyCodexSkillResolution,
} from "./backend";

export interface LegacySkillFeedback {
  tone: "success" | "error";
  title: string;
  summary: string;
  originalPath?: string;
  destinationPath?: string;
  destinationLabel?: string;
  backupPath?: string;
}

function skillDirectory(path: string) {
  return path.replace(/[\\/]SKILL\.md$/, "");
}

export function preferredCodexSkillDirectory(sourcePath: string) {
  return skillDirectory(sourcePath).replace(
    /([\\/])\.codex([\\/])skills([\\/])?/,
    "$1.agents$2skills$3",
  );
}

export function legacyActionConfirmation(
  sourcePath: string,
  action: LegacyCodexSkillAction,
) {
  const sourceDirectory = skillDirectory(sourcePath);
  if (action === "migrate") {
    return [
      "确认迁移 Codex 旧目录 Skill？",
      "",
      `原位置：${sourceDirectory}`,
      `新位置：${preferredCodexSkillDirectory(sourcePath)}`,
      "",
      "AgentHub 会先创建完整备份，再移动整个目录；如果目标已存在，操作会停止且不会覆盖。完成后会显示备份位置。",
    ].join("\n");
  }
  return [
    "确认归档 Codex 旧目录副本？",
    "",
    `旧副本：${sourceDirectory}`,
    "",
    "旧副本会移动到 ~/.agenthub/backups/legacy-codex-skills 目录，不会永久删除。完成后会显示完整备份路径。",
  ].join("\n");
}

export function successfulLegacyActionFeedback(
  result: LegacyCodexSkillResolution,
): LegacySkillFeedback {
  if (result.action === "migrate") {
    return {
      tone: "success",
      title: "Codex Skill 迁移完成",
      summary:
        "完整备份已创建，随后整个 Skill 目录移动到推荐位置；原兼容目录已不存在。",
      originalPath: result.originalPath,
      destinationPath: result.destinationPath,
      destinationLabel: "新位置",
      backupPath: result.backupPath,
    };
  }
  return {
    tone: "success",
    title: "Codex 旧副本已归档",
    summary:
      "~/.agents/skills 中的首选副本保持不变；旧副本没有删除，可从下面的备份位置恢复。",
    originalPath: result.originalPath,
    destinationPath: result.destinationPath,
    destinationLabel: "备份位置",
    backupPath: result.backupPath,
  };
}

export function failedLegacyActionFeedback(
  error: unknown,
): LegacySkillFeedback {
  return {
    tone: "error",
    title: "Codex Skill 处理未完成",
    summary:
      error instanceof Error
        ? error.message
        : "目录状态可能已经变化，请重新扫描后再试。",
  };
}
