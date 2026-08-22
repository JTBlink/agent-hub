# B08：可视化盘点已安装 Skills

Type: task
Status: claimed
Blocked by: D01, D02, B02

## 交付

只读扫描三个 Agent 的全局及工作空间 Skill 目录，在 Skills 中心统一展示安装位置、作用域、兼容性和来源状态。

## 验收标准

- 识别符合规范的 `SKILL.md` 并解析基本元数据。
- 展示 Agent、作用域、实际路径和来源是否可追踪。
- 检测重复名称、无效入口和无法读取目录。
- 未被 AgentHub 安装的 Skill 也能显示，但标记为外部管理。
- 扫描不得修改或移动任何 Skill。
