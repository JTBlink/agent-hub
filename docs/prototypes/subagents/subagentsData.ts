export type AgentKey = "claude_code" | "codex" | "cursor";
export type EntryState = "ok" | "stale" | "edited";

export interface AgentInfo {
  name: string;
  installed: boolean;
  enabled: boolean;
  /** File name the adapter renders for this Agent. */
  format: string;
}

export const AGENTS: Record<AgentKey, AgentInfo> = {
  claude_code: {
    name: "Claude Code",
    installed: true,
    enabled: true,
    format: "claude.md",
  },
  codex: {
    name: "Codex",
    installed: true,
    enabled: true,
    format: "codex.toml",
  },
  cursor: { name: "Cursor", installed: false, enabled: false, format: "—" },
};

export interface Entry {
  workspace: string;
  agent: AgentKey;
  path: string;
  link?: string;
  mode: "symlink" | "copy";
  state: EntryState;
}

export interface Role {
  id: string;
  contract: string;
  description: string;
  source: string;
  tools: string[];
  /** Only agents that actually carry an entry for this role. */
  agents: AgentKey[];
  updated: string;
  entries: Entry[];
}

export const ROLES: Role[] = [
  {
    id: "developer",
    contract: "AGENT.md",
    description:
      "按协调者分配的文件边界编码、验证并交回差异，默认共享当前工作区和分支。",
    source: "本机导入 · work-native-ui/.agents",
    tools: ["Read", "Edit", "Write", "Bash"],
    agents: ["claude_code", "codex"],
    updated: "11 月 14 日 10:49",
    entries: [
      {
        workspace: "全局",
        agent: "claude_code",
        path: "~/.claude/agents/developer.md",
        mode: "symlink",
        state: "ok",
      },
      {
        workspace: "全局",
        agent: "codex",
        path: "~/.codex/agents/developer.toml",
        mode: "symlink",
        state: "ok",
      },
      {
        workspace: "work-native-ui",
        agent: "claude_code",
        path: ".claude/agents/developer.md",
        link: "../../.agents/subagents/developer/native/claude.md",
        mode: "symlink",
        state: "ok",
      },
      {
        workspace: "work-native-ui",
        agent: "codex",
        path: ".codex/agents/developer.toml",
        link: "../../.agents/subagents/developer/native/codex.toml",
        mode: "symlink",
        state: "ok",
      },
    ],
  },
  {
    id: "reviewer",
    contract: "AGENT.md",
    description:
      "按需只读审查需求规格、代码差异和验证证据，报告可定位问题及覆盖范围。",
    source: "本机导入 · work-native-ui/.agents",
    tools: ["Read", "Grep", "Glob"],
    agents: ["claude_code", "codex"],
    updated: "11 月 14 日 10:49",
    entries: [
      {
        workspace: "全局",
        agent: "claude_code",
        path: "~/.claude/agents/reviewer.md",
        mode: "copy",
        state: "stale",
      },
      {
        workspace: "全局",
        agent: "codex",
        path: "~/.codex/agents/reviewer.toml",
        mode: "copy",
        state: "ok",
      },
      {
        workspace: "work-native-ui",
        agent: "claude_code",
        path: ".claude/agents/reviewer.md",
        link: "../../.agents/subagents/reviewer/native/claude.md",
        mode: "symlink",
        state: "edited",
      },
      {
        workspace: "work-native-ui",
        agent: "codex",
        path: ".codex/agents/reviewer.toml",
        link: "../../.agents/subagents/reviewer/native/codex.toml",
        mode: "symlink",
        state: "ok",
      },
    ],
  },
  {
    id: "tester",
    contract: "AGENT.md",
    description:
      "负责协调者分配的批次测试执行，在唯一分配时段集中跑 E2E 并交回原始结果。",
    source: "本机导入 · work-native-ui/.agents",
    tools: ["Read", "Bash"],
    agents: ["claude_code", "codex"],
    updated: "11 月 14 日 10:49",
    entries: [
      {
        workspace: "全局",
        agent: "claude_code",
        path: "~/.claude/agents/tester.md",
        mode: "symlink",
        state: "ok",
      },
      {
        workspace: "work-native-ui",
        agent: "claude_code",
        path: ".claude/agents/tester.md",
        link: "../../.agents/subagents/tester/native/claude.md",
        mode: "symlink",
        state: "ok",
      },
      {
        workspace: "work-native-ui",
        agent: "codex",
        path: ".codex/agents/tester.toml",
        link: "../../.agents/subagents/tester/native/codex.toml",
        mode: "symlink",
        state: "ok",
      },
    ],
  },
];

/** Worst state across all entries decides the card/row badge. */
export function roleState(role: Role): EntryState {
  if (role.entries.some((entry) => entry.state === "edited")) return "edited";
  if (role.entries.some((entry) => entry.state === "stale")) return "stale";
  return "ok";
}

export function contractPreview(role: Role) {
  return `# ${role.id}

${role.description}

## 派发输入

- 任务目标、完成标准、非目标及依赖。
- 当前 worktree、分支、基线；独占可写文件和共享禁写文件。
- 已定接口、对应行为的前置 Red 证据或跑红安排。

关键信息缺失先报协调者，不自行扩大范围。

## 执行边界

- 只改获配文件；同一文件同时只有一个写入者。
- 不执行 Git 写操作，不派生 Agent，不修改 Issue/MR。
- 交接不等于验收、提交或 push。`;
}

export function nativePreview(role: Role, agent: AgentKey) {
  const header =
    agent === "claude_code"
      ? `<!-- 由 AgentHub 从 .agents/subagents/${role.id}/${role.contract} 渲染，勿手工修改 -->`
      : `# 由 AgentHub 从 .agents/subagents/${role.id}/${role.contract} 渲染，勿手工修改`;
  const body =
    agent === "claude_code"
      ? `---
name: ${role.id}
description: ${role.description}
tools: ${role.tools.join(", ")}
---

读取项目 AGENTS.md 和 .agents/subagents/${role.id}/${role.contract}。该文件为唯一契约，
本文件只负责按 Claude Code 的格式转述，契约变更请改 ${role.contract} 后重新渲染。`
      : `name = "${role.id}"
description = "${role.description}"
developer_instructions = "读取项目 AGENTS.md 和 .agents/subagents/${role.id}/${role.contract}。该文件为唯一契约，本文件只负责按 Codex 的格式转述。"

# 未写 model：沿用宿主默认值，任务侧不固定模型`;
  return `${header}\n${body}`;
}
