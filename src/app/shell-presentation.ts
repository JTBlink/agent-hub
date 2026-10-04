import { type ConfigDocument, type InstructionFile } from "../lib/backend";
import { type TranslationKey } from "../lib/i18n";

export type Section =
  | "overview"
  | "configs"
  | "skills"
  | "workspaces"
  | "diagnostics"
  | "history"
  | "settings";

export type IconName =
  | "grid"
  | "sliders"
  | "spark"
  | "folder"
  | "history"
  | "settings"
  | "refresh"
  | "arrow"
  | "shield"
  | "check"
  | "warning"
  | "file"
  | "edit"
  | "external"
  | "search"
  | "plus"
  | "close"
  | "link"
  | "eye"
  | "eye-off";

export const navigation: { id: Section; label: string; icon: IconName }[] = [
  { id: "overview", label: "总览", icon: "grid" },
  { id: "configs", label: "配置中心", icon: "sliders" },
  { id: "skills", label: "Skills", icon: "spark" },
  { id: "workspaces", label: "工作空间", icon: "folder" },
  { id: "diagnostics", label: "诊断中心", icon: "warning" },
  { id: "history", label: "变更历史", icon: "history" },
];

export function navigationLabel(
  id: Section,
  t: (key: TranslationKey) => string,
) {
  const key: Partial<Record<Section, TranslationKey>> = {
    overview: "overview",
    configs: "configs",
    skills: "skills",
    workspaces: "workspaceNav",
    diagnostics: "diagnostics",
    history: "history",
    settings: "settings",
  };
  return key[id] ? t(key[id]!) : id;
}

export const agentMeta: Record<
  string,
  { name: string; tone: string; mark: string }
> = {
  "claude-code": { name: "Claude Code", tone: "violet", mark: "C" },
  codex: { name: "Codex", tone: "teal", mark: "X" },
  opencode: { name: "OpenCode", tone: "amber", mark: "O" },
};

export const SELECTED_WORKSPACE_STORAGE_KEY = "agenthub.selected-workspace";

export function getAgentMeta(agent: string) {
  return (
    agentMeta[agent] ?? {
      name: agent,
      tone: "neutral",
      mark: agent.slice(0, 1).toUpperCase() || "A",
    }
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function statusLabel(status: ConfigDocument["status"] | undefined) {
  if (status === "ready") return "已同步";
  if (status === "missing") return "未找到";
  if (status === "invalid") return "需要修复";
  if (status === "unreadable") return "无法读取";
  return "扫描中";
}

export function getWorkspaceDisplayConfigs(
  globalConfigs: ConfigDocument[],
  workspaceConfigs: ConfigDocument[],
) {
  return workspaceConfigs.map((config) =>
    config.status === "missing"
      ? (globalConfigs.find(
          (global) =>
            global.agent === config.agent && global.status === "ready",
        ) ?? config)
      : config,
  );
}

export function instructionKindLabel(kind: InstructionFile["kind"]) {
  if (kind === "agents") return "Agent 指令";
  if (kind === "claude") return "Claude 指令";
  return "指令文件";
}

export function instructionFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function readPersistedWorkspacePath() {
  try {
    return window.localStorage.getItem(SELECTED_WORKSPACE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function persistWorkspacePath(path: string) {
  try {
    if (path) window.localStorage.setItem(SELECTED_WORKSPACE_STORAGE_KEY, path);
    else window.localStorage.removeItem(SELECTED_WORKSPACE_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restricted or test environments.
  }
}
