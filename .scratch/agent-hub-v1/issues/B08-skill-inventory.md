# B08：可视化盘点已安装 Skills

Type: task
Status: resolved
Blocked by: D01, D02, B02

## 交付

只读扫描三个 Agent 的全局及工作空间 Skill 目录，在 Skills 中心统一展示安装位置、作用域、兼容性和来源状态。

## 验收标准

- 识别符合规范的 `SKILL.md` 并解析基本元数据。
- 展示 Agent、作用域、实际路径和来源是否可追踪。
- 检测重复名称、无效入口和无法读取目录。
- 未被 AgentHub 安装的 Skill 也能显示，但标记为外部管理。
- 扫描不得修改或移动任何 Skill。

## 当前状态

`resolved`。Rust 盘点能力、`scan_skills` 命令与自动化测试已完成；Skills 页面已展示实际路径、兼容性、启用状态、来源类型和管理归属。

## Result

- `scan_installed_skills` 只读扫描三 Agent 的 global/workspace 根目录，返回 Agent、作用域、绝对入口路径、兼容性、启用状态和可追踪来源。
- 解析有效/无效 `SKILL.md`，报告不可读根、无效入口、symlink 和同一冲突域内的重复名称；未发现 marker 的条目标为外部管理。
- AgentHub marker 可识别启用和禁用安装，扫描测试验证不会改变源目录。
