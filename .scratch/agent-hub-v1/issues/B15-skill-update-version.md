# B15：Skill 更新与当前版本展示

Type: task
Status: resolved
Blocked by: B12

## 交付

在已安装 Skill 清单展示当前版本，支持按 Agent 切换查看，并提供可复用原来源、ref 和目标的更新入口。

## 验收标准

- 已安装 Skill 显示 frontmatter `version`；未声明时显示 resolved commit 或内容指纹摘要。
- AgentHub 管理的 Skill 可从清单进入更新检查、更新计划和确认执行流程。
- Skills 页默认选择 Codex，并可切换查看 Claude Code、Codex、OpenCode 各自的 Skills。
- 更新沿用现有 staging、原子替换和外部修改保护；来源 ref 不因更新被静默切换。
- 旧版 marker 缺少新增字段时仍可扫描和卸载。

## Result

- `InstalledSkill` 返回当前版本和已安装指纹；Skill frontmatter 支持读取 `version`。
- 管理 marker 保存原始 requested ref，更新入口复用现有来源浏览与安装计划，确认后执行同一套可回滚更新流程。
- Agent 切换器使用带可见标签的原生下拉菜单，展示各 Agent 的 Skill 数量并与现有筛选组合使用。
- 新增 `skill-update-flow` 纯函数和前端回归测试；Rust Skill 扫描与生命周期测试通过。
