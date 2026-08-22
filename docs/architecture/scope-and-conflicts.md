# 作用域、优先级与冲突规则

> 状态：已确定（D05，2026-08-22）

AgentHub 统一呈现作用域，但不创造跨 Agent 的虚假优先级。每个 adapter 负责声明其官方加载层级；核心只保存层级来源、实际文件和诊断。

## 工作空间身份

- 保存用户输入路径 `entered_path`、规范化绝对路径 `normalized_path` 和存在时的 `canonical_path`。规范化只消除 `.`、`..` 和平台分隔符，不静默跟随符号链接。
- 工作空间 ID 以 canonical path + 文件系统身份为主；路径不存在时使用 normalized path 并标记 `unverified`。同一 canonical path 的重复登记合并为一个工作空间并保留所有别名。
- Git worktree 以工作树根目录为独立工作空间；Git common dir、remote 和 commit 作为仓库关联信息，不作为工作空间主键。
- 扫描和写入都记录实际发现路径。磁盘文件是唯一真实数据源，SQLite 索引丢失或过期时必须可重建。

## 配置层级

配置文档保存 `agent`、`scope`、adapter 层级、实际路径和 checksum。UI 只展示对应 Agent 的官方优先级，例如 Claude 的 managed/user/project/local、Codex 的 CLI/project/profile/user/system、OpenCode 的 remote/global/project/managed；不把“全局优先于工作空间”硬编码为所有 Agent 的统一语义。

当多个逻辑入口解析到同一 canonical 文件时，列表显示一个文件和多个来源别名；当内容不同但 Agent 官方会合并时，显示每层文件和 adapter 计算的 effective view。AgentHub 不自行合并或改写不同层文件。

## Skill 冲突

- `skill_key = canonical source identity + relative path`。同名不同来源、ref 或相对路径是不同 Descriptor，不自动覆盖。
- 同一 Agent/作用域/工作空间的目标目录和 Skill 名称是冲突域。目标已存在且非 AgentHub 管理、或来自另一个来源时，安装计划默认阻止并展示文件级 Diff。
- 同一来源的多个版本可并存于缓存快照，但一个 Agent 目标只允许一个生效安装；更新必须通过 InstallPlan，旧版本进入备份/回滚记录。
- Claude Plugin 的 `plugin:name` 命名空间和 Marketplace 父条目保留；不能把它与普通 `name` 安装互相覆盖。
- 同名 Skill 在不同作用域可以同时存在。实际 Agent 的官方层级决定生效版本，UI 标记 shadowed/active；没有官方层级依据时只显示并列冲突，不猜测赢家。
- 兼容性为 `incompatible` 的 Skill 不创建默认计划；`unknown` 只创建带警告的显式计划。

## 场景示例

| 场景                         | 展示                                                                   | 默认动作                               |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| 全局 `foo` 与工作空间 `foo`  | 两个安装实例，标记 workspace 层遮蔽 global 层（仅在 Agent 官方支持时） | 不自动删除 global                      |
| 来源 A/B 都有 `review`       | 两个 Descriptor、两个来源和兼容性                                      | 选择来源后生成计划；目标冲突先 Diff    |
| 同一目录通过两个符号链接登记 | 一个 canonical workspace，保留两个路径别名                             | 不重复扫描或重复写入                   |
| 外部程序改写已安装 Skill     | 安装指纹与当前指纹不同                                                 | 标记 externally_modified，禁止静默更新 |
| 解析失败的配置层             | 原始文件、路径和诊断仍可见                                             | 不生成结构化写入计划                   |
