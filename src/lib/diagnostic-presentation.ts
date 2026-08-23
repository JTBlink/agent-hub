import type { InstalledSkill, UnifiedDiagnostic } from "./backend";

const agentNames: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
};

const problemLabels: Record<string, string> = {
  "skill:symlink-skipped": "该 Skill 是符号链接，安全扫描已跳过。",
  "skill:codex-legacy-location": "该 Skill 仅安装在 Codex 旧版兼容目录中。",
  "skill:frontmatter-missing": "SKILL.md 缺少开头的 YAML 元数据。",
  "skill:frontmatter-invalid": "SKILL.md 开头的 YAML 元数据格式不正确。",
  "skill:name-invalid": "Skill 名称不符合小写字母、数字和连字符规范。",
  "skill:name-directory-mismatch": "Skill 名称与所在目录名称不一致。",
  "skill:description-missing": "SKILL.md 缺少用于识别用途的 description。",
  "skill:description-too-long": "Skill 的 description 超过长度限制。",
  "skill:entrypoint-unreadable": "AgentHub 无法读取该 Skill 的 SKILL.md。",
  "skill:entrypoint-not-utf8": "SKILL.md 不是可识别的 UTF-8 文本。",
  "skill:no-skills": "所选来源中没有发现 SKILL.md。",
  "skill:scan-depth-exceeded": "目录嵌套过深，安全扫描没有继续向下读取。",
  "skill:scan-entry-limit-exceeded": "来源文件过多，安全扫描已提前停止。",
  "skill:directory-unreadable": "AgentHub 无法读取该 Skill 目录。",
  "skill:skill-root-unreadable": "AgentHub 无法读取 Skill 根目录。",
  "config:permission-denied": "AgentHub 没有权限读取该配置文件。",
  "config:json-syntax": "JSON 配置存在语法错误。",
  "config:jsonc-syntax": "JSONC 配置存在语法错误。",
  "config:toml-syntax": "TOML 配置存在语法错误。",
  "config:schema-mismatch": "配置内容与当前 Agent 的格式要求不匹配。",
  "config:io-failure": "扫描配置文件时发生文件系统错误。",
};

function pathSegments(path: string) {
  return path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean);
}

function skillNameFromPath(path: string | null) {
  if (!path) return undefined;
  const segments = pathSegments(path);
  if (!segments.length) return undefined;
  const last = segments.at(-1);
  return last === "SKILL.md" ? segments.at(-2) : last;
}

export function diagnosticSubject(item: UnifiedDiagnostic) {
  if (item.code.startsWith("skill:duplicate-name:")) {
    return item.code.slice("skill:duplicate-name:".length) || "同名 Skill";
  }
  if (item.code.startsWith("skill:")) {
    return skillNameFromPath(item.resourcePath) ?? "Skill 来源";
  }
  if (item.code.startsWith("config:")) {
    const agent = item.agent ? (agentNames[item.agent] ?? item.agent) : "Agent";
    const scope = item.scope === "workspace" ? "工作空间" : "全局";
    return `${agent} ${scope}配置`;
  }
  if (item.code.startsWith("storage:")) return "本地数据库";
  if (item.code.startsWith("cache:")) return "扫描缓存";
  if (item.code.startsWith("scan:")) return "资源扫描";
  return "AgentHub 诊断";
}

export function diagnosticProblem(item: UnifiedDiagnostic) {
  if (item.code.startsWith("skill:duplicate-name:")) {
    return "同一个 Agent 在多个目录发现了同名 Skill，副本内容可能已经漂移。";
  }
  return (
    problemLabels[item.code] ??
    (item.code.startsWith("skill:")
      ? "该 Skill 的结构或来源存在问题，可能无法被 Agent 正确加载。"
      : item.impact)
  );
}

export function diagnosticRealSkillPath(item: UnifiedDiagnostic) {
  if (item.code !== "skill:symlink-skipped") return undefined;
  const marker = "真实 Skill 路径：";
  const markerIndex = item.impact.indexOf(marker);
  return markerIndex >= 0
    ? item.impact.slice(markerIndex + marker.length).trim()
    : undefined;
}

export function matchingSkillsForDiagnostic(
  item: UnifiedDiagnostic,
  skills: InstalledSkill[],
) {
  if (!item.code.startsWith("skill:")) return [];
  const subject = diagnosticSubject(item);
  const resourcePath = item.resourcePath?.replace(/[\\/]+$/, "");
  return skills.filter((skill) => {
    if (item.agent && skill.agent !== item.agent) return false;
    if (item.scope && skill.scope !== item.scope) return false;
    const skillPath = skill.path.replace(/[\\/]+$/, "");
    return (
      skill.name === subject ||
      skill.displayName === subject ||
      Boolean(
        resourcePath &&
        (skillPath === resourcePath ||
          resourcePath.startsWith(`${skillPath}/`) ||
          skillPath.startsWith(`${resourcePath}/`)),
      )
    );
  });
}
