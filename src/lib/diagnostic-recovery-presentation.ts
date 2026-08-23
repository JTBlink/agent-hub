import type { DiagnosticRecoveryPreview, UnifiedDiagnostic } from "./backend";
import { diagnosticSubject } from "./diagnostic-presentation";

const agentNames: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
};

export interface RecoveryDetail {
  label: string;
  value: string;
  mono?: boolean;
}

export interface DiagnosticRecoveryPresentation {
  eyebrow: string;
  title: string;
  description: string;
  details: RecoveryDetail[];
  effects: string[];
  safetyNote: string;
  actionLabel: string;
  readOnly: boolean;
}

function splitResourcePath(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/);
  const entryFile = segments.at(-1) ?? "";
  const isSkillEntry = entryFile === "SKILL.md";
  return {
    installationDirectory: isSkillEntry
      ? normalized.slice(0, -(entryFile.length + 1))
      : normalized,
    entryFile: isSkillEntry ? entryFile : undefined,
  };
}

/** Keep the actual path while hiding the machine-specific home directory. */
export function compactUserPath(path: string) {
  const unixHome = path.match(/^(?:\/Users|\/home)\/[^/]+(\/.*)?$/);
  if (unixHome) return `~${unixHome[1] ?? ""}`;
  const windowsHome = path.match(/^[A-Za-z]:\\Users\\[^\\]+(\\.*)?$/);
  if (windowsHome) return `~${windowsHome[1] ?? ""}`;
  return path;
}

function isReadOnlyRefresh(preview: DiagnosticRecoveryPreview) {
  return [
    "rescan_resource",
    "reload_resource",
    "refresh_skill_source",
  ].includes(preview.plan.action);
}

export function diagnosticRecoveryPresentation(
  preview: DiagnosticRecoveryPreview,
  diagnostic?: UnifiedDiagnostic,
): DiagnosticRecoveryPresentation {
  const readOnly = isReadOnlyRefresh(preview);
  const subject = diagnostic ? diagnosticSubject(diagnostic) : "当前资源";
  const details: RecoveryDetail[] = diagnostic
    ? [{ label: "问题对象", value: subject }]
    : [];

  if (diagnostic?.agent) {
    details.push({
      label: "Agent",
      value: agentNames[diagnostic.agent] ?? diagnostic.agent,
    });
  }
  if (diagnostic?.scope) {
    details.push({
      label: "作用域",
      value: diagnostic.scope === "global" ? "全局" : "工作空间",
    });
  }
  if (preview.plan.resourcePath) {
    const resource = splitResourcePath(preview.plan.resourcePath);
    details.push({
      label: diagnostic?.code.startsWith("skill:") ? "安装目录" : "资源位置",
      value: compactUserPath(resource.installationDirectory),
      mono: true,
    });
    if (resource.entryFile) {
      details.push({
        label: "入口文件",
        value: resource.entryFile,
        mono: true,
      });
    }
  }

  if (readOnly) {
    return {
      eyebrow: diagnostic?.code.startsWith("skill:")
        ? "Skill 扫描预览"
        : "扫描预览",
      title: `重新扫描 ${subject}`,
      description:
        "AgentHub 会重新读取当前目录和入口文件，用最新的磁盘状态刷新诊断结果。",
      details,
      effects: ["重新读取目录和入口文件", "刷新诊断列表中的检查结果"],
      safetyNote:
        "这是只读操作：不会修改配置，也不会安装、迁移、归档或删除文件。",
      actionLabel: "重新扫描并刷新诊断",
      readOnly: true,
    };
  }

  return {
    eyebrow: "处理方案",
    title: preview.summary,
    description: "执行前请核对问题对象和资源位置。",
    details,
    effects: [],
    safetyNote: preview.plan.confirmationRequired
      ? "此操作可能改变配置或安装状态，执行前需要再次确认。"
      : "操作完成后会刷新诊断结果。",
    actionLabel: preview.plan.confirmationRequired
      ? "确认并处理"
      : "执行处理方案",
    readOnly: false,
  };
}
