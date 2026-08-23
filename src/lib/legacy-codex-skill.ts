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
      "要把这个 Codex Skill 移到推荐位置吗？",
      "",
      `原位置：${sourceDirectory}`,
      `新位置：${preferredCodexSkillDirectory(sourcePath)}`,
      "",
      "我们会先创建完整备份，再移动整个 Skill 目录。目标位置已有同名目录时会停止操作，不会覆盖现有文件。",
    ].join("\n");
  }
  return [
    "要把旧的 Codex Skill 副本归档吗？",
    "",
    `旧副本：${sourceDirectory}`,
    "",
    "旧副本会移动到备份目录，不会永久删除；完成后你仍可以从备份位置找回它。",
  ].join("\n");
}

export function legacyActionConfirmOptions(
  sourcePath: string,
  action: LegacyCodexSkillAction,
) {
  const sourceDirectory = skillDirectory(sourcePath);
  if (action === "migrate") {
    return {
      title: "要把这个 Codex Skill 移到推荐位置吗？",
      paths: [
        `原位置：${sourceDirectory}`,
        `新位置：${preferredCodexSkillDirectory(sourcePath)}`,
      ],
      note: "我们会先创建完整备份，再移动整个 Skill 目录。目标位置已有同名目录时会停止操作，不会覆盖现有文件。",
    };
  }
  return {
    title: "要把旧的 Codex Skill 副本归档吗？",
    paths: [`旧副本：${sourceDirectory}`],
    note: "旧副本会移动到备份目录，不会永久删除；完成后你仍可以从备份位置找回它。",
  };
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
        : typeof error === "string" && error.trim()
          ? error
          : "目录状态可能已经变化，请重新扫描后再试。",
  };
}
