# B21：移除默认技能库的 library 层级

Type: task
Status: claimed
Blocked by: none

## Scope

默认技能目录改为 ~/.agent-hub/skills，兼容旧默认库并迁移数据库、元数据和部署引用，不覆盖已有目标内容，不接管 ~/.skills-manager 中的旧数据。

## Acceptance

- 增加相关回归测试，更新产品说明和 CHANGELOG。
- 构建、测试、格式、lint 和严格 Clippy 检查通过。
