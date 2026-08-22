# D05：确定配置作用域、优先级与冲突规则

Type: decision
Status: resolved
Blocked by: D01, D02

## 目标

明确 AgentHub 如何表示全局和工作空间配置、符号链接、重复 Skill、同名来源与继承关系。

## 验收标准

- 明确“磁盘文件是真实数据源”的不变量。
- 定义规范化路径、符号链接和重复工作空间处理。
- 只展示 Agent 官方优先级，不创造跨 Agent 的虚假统一优先级。
- 定义同名 Skill 多来源、多版本和多作用域冲突提示。
- 用 ADR 和示例场景记录结论。

## Result

- 已定义 entered/normalized/canonical path、文件系统身份、Git worktree 和重复工作空间合并规则。
- 已确定磁盘文件为唯一真实数据源，配置 adapter 只展示各 Agent 官方优先级，不创造跨 Agent 统一层级。
- 已定义同名 Skill 多来源、多版本、多作用域、Plugin namespace、symlink 和外部修改冲突规则。
- 已用场景表和 ADR-0004 记录默认动作、被否决方案和回滚边界。
