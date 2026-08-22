# ADR-0004：按 Agent 官方层级展示作用域并显式处理冲突

- 状态：已接受
- 日期：2026-08-22

AgentHub 保存用户路径与 canonical path、实际文件和来源别名，但不把跨 Agent 的 global/workspace 概念强行折叠成一套优先级。配置 adapter 提供官方层级和 effective view；Skill 冲突以 `source identity + relative path` 区分 Descriptor，以 Agent/作用域/工作空间/目标目录识别安装冲突，所有覆盖都必须进入可回滚 InstallPlan。

## 被否决方案

- **全局永远低于工作空间**：Claude、Codex、OpenCode 的层级和合并语义不同，统一规则会误导用户。
- **同名 Skill 自动选最新或最后扫描者**：会把来源、兼容性和用户意图变成不可见的覆盖。
- **以字符串路径作为工作空间身份**：符号链接、相对路径和 Git worktree 会产生重复扫描或误合并。
- **扫描时直接修复冲突**：扫描应只读；覆盖、删除和切换版本必须有 Diff、确认和回滚点。
